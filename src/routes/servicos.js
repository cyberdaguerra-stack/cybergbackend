import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, c.nome AS categoria
      FROM servicos s
      LEFT JOIN categorias_servico c ON c.id = s.categoria_id
      ORDER BY s.status DESC, s.nome
    `)
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar serviços' }) }
})

router.post('/', authorize('admin_geral','admin'), async (req, res) => {
  const { nome, descricao, preco_mensal, categoria_id, status = 'activo' } = req.body
  if (!nome || !preco_mensal) return res.status(400).json({ message: 'nome e preco_mensal são obrigatórios' })
  try {
    const { rows } = await query(
      'INSERT INTO servicos (nome, descricao, preco_mensal, categoria_id, status, criado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nome.trim(), descricao || null, Number(preco_mensal), categoria_id || null, status, req.user.id]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) { res.status(500).json({ message: 'Erro ao criar serviço' }) }
})

router.patch('/:id', authorize('admin_geral','admin'), async (req, res) => {
  const { nome, descricao, preco_mensal, status } = req.body
  try {
    const { rows } = await query(
      'UPDATE servicos SET nome=COALESCE($1,nome), descricao=COALESCE($2,descricao), preco_mensal=COALESCE($3,preco_mensal), status=COALESCE($4,status) WHERE id=$5 RETURNING *',
      [nome, descricao, preco_mensal, status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Serviço não encontrado' })
    res.json({ data: rows[0] })
  } catch (err) { res.status(500).json({ message: 'Erro ao actualizar serviço' }) }
})

router.delete('/:id', authorize('admin_geral','admin'), async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM servicos WHERE id=$1', [req.params.id])
    if (!rowCount) return res.status(404).json({ message: 'Serviço não encontrado' })
    res.json({ message: 'Serviço eliminado' })
  } catch (err) { res.status(500).json({ message: 'Erro ao eliminar' }) }
})

export default router
