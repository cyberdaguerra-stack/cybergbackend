import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import authRouter from './routes/auth.js'
import fluxoRouter from './routes/fluxo.js'
import { servicosRouter, usuariosRouter, estatisticasRouter, relatoriosRouter } from './routes/resources.js'
import { query } from './db/pool.js'

const app  = express()
const PORT = process.env.PORT || 3001

// TRUST PROXY — obrigatório no Vercel/serverless
app.set('trust proxy', 1)

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false })
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiadas tentativas.' } })
app.use('/api', limiter)
app.use('/api/auth', authLimiter)

app.get('/api/health', async (_, res) => {
  try { await query('SELECT 1'); res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() }) }
  catch (err) { res.status(500).json({ status: 'error', db: err.message }) }
})

// SETUP ENDPOINT — inicializa DB e popula dados (chamar uma vez)
app.get('/api/setup', async (req, res) => {
  if (req.query.token !== (process.env.SETUP_TOKEN || 'cyberg_setup_2025')) {
    return res.status(403).json({ message: 'Token invalido' })
  }
  const log = []
  const out = (m) => { log.push(m); console.log(m) }
  try {
    await query(`CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL, email VARCHAR(180) NOT NULL UNIQUE, password_hash TEXT NOT NULL, role ENUM('admin_geral','admin','funcionario') NOT NULL DEFAULT 'funcionario', status ENUM('activo','inactivo','suspenso') NOT NULL DEFAULT 'activo', ultimo_acesso DATETIME, criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, actualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK users')
    await query(`CREATE TABLE IF NOT EXISTS categorias_caixa (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(80) NOT NULL UNIQUE, tipo ENUM('entrada','saida') NOT NULL, cor VARCHAR(20), criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK categorias_caixa')
    await query(`CREATE TABLE IF NOT EXISTS fluxo_caixa (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, tipo ENUM('entrada','saida') NOT NULL, descricao VARCHAR(255) NOT NULL, valor DECIMAL(14,2) NOT NULL DEFAULT 0, categoria_id INT UNSIGNED, data_tx DATE NOT NULL, hora_tx TIME NOT NULL DEFAULT '00:00:00', observacoes TEXT, criado_por INT UNSIGNED, criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, actualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK fluxo_caixa')
    await query(`CREATE TABLE IF NOT EXISTS categorias_servico (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(80) NOT NULL UNIQUE, criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK categorias_servico')
    await query(`CREATE TABLE IF NOT EXISTS servicos (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(160) NOT NULL, descricao TEXT, preco_mensal DECIMAL(14,2) NOT NULL DEFAULT 0, categoria_id INT UNSIGNED, status ENUM('activo','inactivo') NOT NULL DEFAULT 'activo', criado_por INT UNSIGNED, criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, actualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK servicos')
    await query(`CREATE TABLE IF NOT EXISTS relatorios (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, tipo ENUM('semanal','mensal') NOT NULL, periodo_inicio DATE NOT NULL, periodo_fim DATE NOT NULL, total_entradas DECIMAL(14,2) NOT NULL DEFAULT 0, total_saidas DECIMAL(14,2) NOT NULL DEFAULT 0, gerado_por INT UNSIGNED, ficheiro_url TEXT, criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    out('OK relatorios')

    const h = (pw) => bcrypt.hashSync(pw, 10)
    await query(`INSERT IGNORE INTO users (nome,email,password_hash,role,status) VALUES (?,?,?,'admin_geral','activo'),(?,?,?,'admin','activo'),(?,?,?,'funcionario','activo'),(?,?,?,'funcionario','inactivo')`,
      ['Carlos Mendes','carlos@cyberg.ao',h('Admin@1234'),'Joao Administrador','joao@cyberg.ao',h('Admin@1234'),'Maria Funcionaria','maria@cyberg.ao',h('Func@1234'),'Paulo Tecnico','paulo@netfacil.ao',h('Func@1234')])
    out('OK users seed')

    await query(`INSERT IGNORE INTO categorias_caixa (nome,tipo,cor) VALUES ('Internet','entrada','#7c3aed'),('Instalacao','entrada','#3b82f6'),('Suporte','entrada','#06b6d4'),('Outros Rend.','entrada','#10b981'),('Salarios','saida','#f43f5e'),('Fornecedores','saida','#fb923c'),('Operacional','saida','#f59e0b'),('Equipamento','saida','#8b5cf6'),('Outros Desp.','saida','#94a3b8')`)
    out('OK categorias_caixa seed')

    await query(`INSERT IGNORE INTO categorias_servico (nome) VALUES ('Internet'),('Instalacao'),('Suporte'),('TV'),('Outros')`)
    out('OK categorias_servico seed')

    const cats = await query('SELECT id,nome FROM categorias_servico')
    const cid = Object.fromEntries(cats.map(c=>[c.nome,c.id]))
    await query(`INSERT IGNORE INTO servicos (nome,descricao,preco_mensal,categoria_id,status,criado_por) VALUES
      ('Internet Fibra 10 Mbps','Plano basico',25000,?,'activo',1),
      ('Internet Fibra 50 Mbps','Plano medio',45000,?,'activo',1),
      ('Internet Fibra 100 Mbps','Alta velocidade',75000,?,'activo',1),
      ('Instalacao Residencial','Casa completa',35000,?,'activo',1),
      ('Instalacao Empresarial','Empresas',65000,?,'activo',1),
      ('Suporte Remoto','Via video',8000,?,'activo',1),
      ('Suporte Presencial','No local',15000,?,'activo',1),
      ('TV Premium','120+ canais HD',22000,?,'activo',1)`,
      [cid['Internet'],cid['Internet'],cid['Internet'],cid['Instalacao'],cid['Instalacao'],cid['Suporte'],cid['Suporte'],cid['TV']])
    out('OK servicos seed')

    const txCats = await query('SELECT id,nome FROM categorias_caixa')
    const tc = Object.fromEntries(txCats.map(c=>[c.nome,c.id]))
    let total=0
    for(let d=29;d>=0;d--){
      const date=new Date(); date.setDate(date.getDate()-d)
      const ds=date.toISOString().split('T')[0]
      const rows=[]
      for(let i=0;i<2+Math.floor(Math.random()*3);i++){
        rows.push(['entrada',`Mensalidade Internet #${1000+Math.floor(Math.random()*8000)}`,[25000,45000,75000][Math.floor(Math.random()*3)],tc['Internet'],ds,1])
      }
      if(Math.random()>0.6) rows.push(['entrada','Instalacao',Math.random()>0.5?35000:65000,tc['Instalacao'],ds,2])
      if(Math.random()>0.5) rows.push(['entrada','Suporte',Math.random()>0.5?8000:15000,tc['Suporte'],ds,2])
      if(d%7===0) rows.push(['saida','Fornecedor Fibra',50000+Math.floor(Math.random()*40000),tc['Fornecedores'],ds,1])
      if(d===29) rows.push(['saida','Folha Salarial',120000,tc['Salarios'],ds,1])
      if(Math.random()>0.7) rows.push(['saida','Operacional',5000+Math.floor(Math.random()*20000),tc['Operacional'],ds,2])
      if(rows.length>0){
        const ph=rows.map(()=>'(?,?,?,?,?,?)').join(',')
        await query(`INSERT INTO fluxo_caixa (tipo,descricao,valor,categoria_id,data_tx,criado_por) VALUES ${ph}`,rows.flat())
        total+=rows.length
      }
    }
    out(`OK ${total} transaccoes inseridas`)

    await query(`INSERT IGNORE INTO relatorios (tipo,periodo_inicio,periodo_fim,total_entradas,total_saidas,gerado_por) VALUES ('mensal','2025-01-01','2025-01-31',460000,184000,1),('mensal','2025-02-01','2025-02-28',530000,212000,1),('semanal','2025-03-03','2025-03-09',148000,45000,2)`)
    out('OK relatorios seed')
    out('SETUP COMPLETO!')

    res.json({ success:true, log, credentials:{
      admin_geral: {email:'carlos@cyberg.ao', password:'Admin@1234'},
      admin: {email:'joao@cyberg.ao', password:'Admin@1234'},
      funcionario: {email:'maria@cyberg.ao', password:'Func@1234'}
    }})
  } catch(err) {
    console.error(err)
    res.status(500).json({ success:false, error:err.message, log })
  }
})

app.use('/api/auth',         authRouter)
app.use('/api/fluxo',        fluxoRouter)
app.use('/api/servicos',     servicosRouter)
app.use('/api/categorias-servico', servicosRouter)
app.use('/api/categorias-fluxo',   servicosRouter)
app.use('/api/usuarios',     usuariosRouter)
app.use('/api/estatisticas', estatisticasRouter)
app.use('/api/relatorios',   relatoriosRouter)

app.use((req,res) => res.status(404).json({ message:`${req.method} ${req.path} nao encontrado` }))
app.use((err,req,res,_next) => { console.error(err); res.status(500).json({ message:'Erro interno' }) })

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Cyber G API porta ${PORT}`)
  console.log('Server listening on http://127.0.0.1:' + PORT)
})

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

export default app
