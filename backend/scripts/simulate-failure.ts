import axios from 'axios';
import { randomUUID } from 'crypto';

const API_URL = 'http://localhost:3000/signals';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulate() {
  console.log('🚀 Starting Failure Simulation...');

  // 1. Fire 5,000 P2 signals rapidly to simulate noise
  console.log('📡 Firing 5,000 P2 noise signals...');
  let droppedP2 = 0;
  for (let i = 0; i < 5000; i++) {
    try {
      await axios.post(API_URL, {
        componentId: 'svc-cache',
        severity: 'P2',
        message: 'Cache miss rate spiked',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.response?.status === 503) {
        droppedP2++;
      }
    }
  }
  console.log(`✅ Finished P2 noise. Dropped by Load Shedder: ${droppedP2}`);

  // 2. Fire a P0 critical DB crash
  console.log('🚨 Firing P0 Critical Incident...');
  try {
    const res = await axios.post(API_URL, {
      componentId: 'svc-db',
      severity: 'P0',
      message: 'OOM Killer terminated PostgreSQL primary',
      timestamp: new Date().toISOString(),
      metadata: { region: 'us-east-1', db_cluster: 'prod-main' }
    });
    console.log(`✅ P0 Accepted! Signal ID: ${res.data.signalId}`);
  } catch (err: any) {
    console.error(`❌ Failed to send P0: ${err.message}`);
  }

  console.log('🏁 Simulation complete. Check PulseGuard logs for Circuit Breaker and Processing activity.');
}

simulate().catch(console.error);
