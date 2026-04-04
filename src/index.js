import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRouter from './routes/auth.js'
import fluxoRouter from './routes/fluxo.js'
import { servicosRouter, usuariosRouter, estatisticasRouter, relatoriosRouter } from './routes/resources.js'

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/api', rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }))
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: { message: 'Demasiadas tentativas.' } }))

app.get('/api/health', async (_, res) => {
  try {
    const { query } = await import('./db/pool.js')
    await query('SELECT 1')
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message })
  }
})

app.use('/api/auth',         authRouter)
app.use('/api/fluxo',        fluxoRouter)
app.use('/api/servicos',     servicosRouter)
app.use('/api/usuarios',     usuariosRouter)
app.use('/api/estatisticas', estatisticasRouter)
app.use('/api/relatorios',   relatoriosRouter)

app.use((req, res) => res.status(404).json({ message: `${req.method} ${req.path} não encontrado` }))
app.use((err, req, res, _next) => { console.error(err); res.status(500).json({ message: 'Erro interno' }) })

app.listen(PORT, () => console.log(`Cyber G API → http://localhost:${PORT}`))
export default app
