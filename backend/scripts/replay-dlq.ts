import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'dlq-replayer',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
});

async function replay() {
  const consumer = kafka.consumer({ groupId: 'dlq-replay-group' });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();

  console.log('🔄 Connected to Kafka. Fetching DLT messages...');

  await consumer.subscribe({ topic: 'signal-ingested.DLT', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const originalTopic = message.headers?.originalTopic?.toString() || 'signal-ingested';
      
      console.log(`Replaying message ${message.key?.toString()} to ${originalTopic}`);

      // Strip error headers to give it a fresh start
      const cleanHeaders = { ...message.headers };
      delete cleanHeaders.error;
      delete cleanHeaders['retry-count'];

      await producer.send({
        topic: originalTopic,
        messages: [{
          key: message.key,
          value: message.value,
          headers: cleanHeaders,
        }],
      });
    },
  });

  // Stop after a few seconds of no messages (simple implementation for script)
  setTimeout(async () => {
    console.log('✅ Replay complete. Disconnecting...');
    await consumer.disconnect();
    await producer.disconnect();
    process.exit(0);
  }, 5000);
}

replay().catch(console.error);
