import { store } from './agents/ops-store.js';

/** Seed primário: 5 serviços + 6 alertas (3 firing, 3 resolved) + runbooks */
async function runSeed(): Promise<void> {
  console.log('🌱 Iniciando seed do banco OpsPilot (SQLite)...\n');

  await store.seed();

  const alerts = await store.listAlerts('all');
  const firing = alerts.filter((a) => a.status === 'firing').length;
  const resolved = alerts.filter((a) => a.status === 'resolved').length;

  console.log('✓ Serviços criados (5): api-gateway, auth-service, billing-service, notification-service, analytics-service');
  console.log(`✓ Alertas criados (${alerts.length}): ${firing} firing, ${resolved} resolved`);
  console.log('✓ Runbooks criados: checkout, payments, auth, api-gateway, billing-service, auth-service');
  console.log('\n✅ Seed concluído com sucesso.');
}

runSeed().catch((err: unknown) => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
