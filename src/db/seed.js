/**
 * CYBER G × NETFACIL — MySQL Seed
 * Run: npm run db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { query } from './pool.js'
import pool from './pool.js'

async function seed() {
  console.log('🌱  Seeding Cyber G MySQL database...')
  try {
    // ── USERS ──────────────────────────────────────────────
    console.log('   → users')
    const h = (pw) => bcrypt.hashSync(pw, 10)
    await query(`
      INSERT IGNORE INTO users (nome, email, password_hash, role, status, ultimo_acesso) VALUES
        (?, ?, ?, 'admin_geral', 'activo',   DATE_SUB(NOW(), INTERVAL 1 HOUR)),
        (?, ?, ?, 'admin',       'activo',   DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (?, ?, ?, 'funcionario', 'activo',   DATE_SUB(NOW(), INTERVAL 2 DAY)),
        (?, ?, ?, 'funcionario', 'inactivo', DATE_SUB(NOW(), INTERVAL 6 DAY))
    `, [
      'Carlos Mendes',      'carlos@cyberg.ao',  h('Admin@1234'),
      'João Administrador', 'joao@cyberg.ao',    h('Admin@1234'),
      'Maria Funcionária',  'maria@cyberg.ao',   h('Func@1234'),
      'Paulo Técnico',      'paulo@netfacil.ao', h('Func@1234'),
    ])

    // ── CATEGORIAS CAIXA ────────────────────────────────────
    console.log('   → categorias_caixa')
    await query(`
      INSERT IGNORE INTO categorias_caixa (nome, tipo, cor) VALUES
        ('Internet',     'entrada', '#7c3aed'),
        ('Instalação',   'entrada', '#3b82f6'),
        ('Suporte',      'entrada', '#06b6d4'),
        ('Outros Rend.', 'entrada', '#10b981'),
        ('Salários',     'saida',   '#f43f5e'),
        ('Fornecedores', 'saida',   '#fb923c'),
        ('Operacional',  'saida',   '#f59e0b'),
        ('Equipamento',  'saida',   '#8b5cf6'),
        ('Outros Desp.', 'saida',   '#94a3b8')
    `)

    // ── CATEGORIAS SERVIÇO ──────────────────────────────────
    console.log('   → categorias_servico')
    await query(`
      INSERT IGNORE INTO categorias_servico (nome) VALUES
        ('Internet'), ('Instalação'), ('Suporte'), ('TV'), ('Outros')
    `)

    // ── SERVIÇOS ────────────────────────────────────────────
    console.log('   → servicos')
    const cats = await query('SELECT id, nome FROM categorias_servico')
    const catId = Object.fromEntries(cats.map(c => [c.nome, c.id]))

    await query(`
      INSERT IGNORE INTO servicos (nome, descricao, preco_mensal, categoria_id, status, criado_por) VALUES
        (?, ?, 25000,  ?, 'activo',   1),
        (?, ?, 45000,  ?, 'activo',   1),
        (?, ?, 75000,  ?, 'activo',   1),
        (?, ?, 150000, ?, 'activo',   1),
        (?, ?, 35000,  ?, 'activo',   1),
        (?, ?, 65000,  ?, 'activo',   1),
        (?, ?, 8000,   ?, 'activo',   1),
        (?, ?, 15000,  ?, 'activo',   1),
        (?, ?, 12000,  ?, 'inactivo', 1),
        (?, ?, 22000,  ?, 'activo',   1)
    `, [
      'Internet Fibra 10 Mbps',      'Plano residencial básico',           catId['Internet'] || null,
      'Internet Fibra 50 Mbps',      'Plano médio ideal para famílias',    catId['Internet'] || null,
      'Internet Fibra 100 Mbps',     'Alta velocidade para empresas',      catId['Internet'] || null,
      'Internet Empresarial 200Mbps','Plano dedicado empresarial',         catId['Internet'] || null,
      'Instalação Residencial',      'Instalação completa em casa',        catId['Instalação'] || null,
      'Instalação Empresarial',      'Cablagem estruturada empresarial',   catId['Instalação'] || null,
      'Suporte Técnico Remoto',      'Assistência via vídeo ou telefone',  catId['Suporte'] || null,
      'Suporte Técnico Presencial',  'Técnico deslocado ao local',         catId['Suporte'] || null,
      'TV por Cabo Básico',          'Pacote com 50+ canais',              catId['TV'] || null,
      'TV por Cabo Premium',         'Pacote com 120+ canais HD',          catId['TV'] || null,
    ])

    // ── FLUXO DE CAIXA (90 days) ───────────────────────────
    console.log('   → fluxo_caixa (90 dias de dados)...')
    const txCats = await query('SELECT id, nome FROM categorias_caixa')
    const txCat = Object.fromEntries(txCats.map(c => [c.nome, c.id]))

    let totalInserted = 0
    for (let d = 89; d >= 0; d--) {
      const date = new Date()
      date.setDate(date.getDate() - d)
      const dateStr = date.toISOString().split('T')[0]
      const batch = []

      // Internet (2–5/dia) - usar primeiro id se não encontrar
      const internetId = txCat['Internet'] || 1
      const n = 2 + Math.floor(Math.random() * 4)
      for (let i = 0; i < n; i++) {
        const v = [25000, 45000, 75000][Math.floor(Math.random() * 3)]
        batch.push([`entrada`, `Mensalidade Internet — Cliente #${1000 + Math.floor(Math.random() * 8000)}`, v, internetId, dateStr, 1])
      }
      // Instalações
      if (Math.random() > 0.6) {
        const instId = txCat['Instalação'] || 1
        batch.push(['entrada', `Instalação ${Math.random() > 0.5 ? 'Residencial' : 'Empresarial'}`, Math.random() > 0.5 ? 35000 : 65000, instId, dateStr, 2])
      }
      // Suporte
      if (Math.random() > 0.5) {
        const supId = txCat['Suporte'] || 1
        batch.push(['entrada', 'Suporte Técnico', Math.random() > 0.5 ? 8000 : 15000, supId, dateStr, 2])
      }
      // Salário mensal
      if (d % 30 === 0) {
        const salId = txCat['Salários'] || 1
        batch.push(['saida', 'Folha Salarial', 120000, salId, dateStr, 1])
      }
      // Fornecedor semanal
      if (d % 7 === 0) {
        const fornId = txCat['Fornecedores'] || 1
        batch.push(['saida', 'Pagamento Fornecedor Fibra', 50000 + Math.floor(Math.random() * 40000), fornId, dateStr, 1])
      }
      // Operacional
      if (Math.random() > 0.7) {
        const opId = txCat['Operacional'] || 1
        const items = ['Combustível viatura', 'Água e energia', 'Material escritório', 'Aluguer escritório']
        batch.push(['saida', items[Math.floor(Math.random() * items.length)], 5000 + Math.floor(Math.random() * 20000), opId, dateStr, 2])
      }

      if (batch.length > 0) {
        const placeholders = batch.map(() => '(?,?,?,?,?,?)').join(',')
        const values = batch.flat()
        await query(`INSERT INTO fluxo_caixa (tipo, descricao, valor, categoria_id, data_tx, criado_por) VALUES ${placeholders}`, values)
        totalInserted += batch.length
      }
    }
    console.log(`   → ${totalInserted} registos inseridos`)

    // ── RELATÓRIOS ─────────────────────────────────────────
    console.log('   → relatorios')
    await query(`
      INSERT INTO relatorios (tipo, periodo_inicio, periodo_fim, total_entradas, total_saidas, gerado_por) VALUES
        ('mensal',  '2025-01-01', '2025-01-31', 460000, 184000, 1),
        ('mensal',  '2025-02-01', '2025-02-28', 530000, 212000, 1),
        ('semanal', '2025-03-03', '2025-03-09', 148000, 45000,  2),
        ('semanal', '2025-03-10', '2025-03-16', 165000, 52000,  2),
        ('semanal', '2025-03-17', '2025-03-23', 178000, 61000,  2)
    `)

    console.log('\n✅  Seed concluído com sucesso!')
    console.log('\n   Credenciais:')
    console.log('   Admin Geral  → carlos@cyberg.ao  / Admin@1234')
    console.log('   Admin        → joao@cyberg.ao    / Admin@1234')
    console.log('   Funcionário  → maria@cyberg.ao   / Func@1234')
  } catch (err) {
    console.error('❌  Seed falhou:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seed()
