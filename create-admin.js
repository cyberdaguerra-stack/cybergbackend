import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { query } from './src/db/pool.js'
import pool from './src/db/pool.js'

async function createAdmin() {
  console.log('🔐 Criando usuário admin padrão...')
  try {
    const hash = await bcrypt.hash('admincyberg', 10)
    
    const result = await query(
      'INSERT INTO users (nome, email, password_hash, role, status, ultimo_acesso) VALUES (?, ?, ?, ?, ?, NOW())',
      ['Admin Cyberg', 'cyberg@admin.com', hash, 'admin_geral', 'activo']
    )
    
    console.log('\n✅ Usuário criado com sucesso!')
    console.log('\n   Email: cyberg@admin.com')
    console.log('   Senha: admincyberg')
    console.log('   Perfil: Admin Geral')
    console.log('   ID: ' + result.insertId)
    
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.log('\n⚠️  Usuário cyberg@admin.com já existe.')
      console.log('\n   Email: cyberg@admin.com')
      console.log('   Senha: admincyberg')
    } else {
      console.error('\n❌ Erro:', err.message)
    }
  } finally {
    await pool.end()
  }
}

createAdmin()
