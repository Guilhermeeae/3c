// Script para inicializar os usuários no banco de dados
// Execute este arquivo UMA VEZ para criar os usuários

const { initializeUsers } = require('./mongodb');

async function run() {
  console.log('Inicializando usuários no banco de dados...');
  await initializeUsers();
  console.log('Processo concluído!');
  process.exit(0);
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
