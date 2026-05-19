const SB_URL = "https://svzsdaaidmdmyitsrjau.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2enNkYWFpZG1kbXlpdHNyamF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzc1NDAsImV4cCI6MjA5MDkxMzU0MH0.g2ZklKFxXzko7mGvgjuXpepACqLmGUBEUJiDoi9GC1Y";

async function testAll() {
  const tables = ['servidores', 'programacoes', 'folgas', 'solicitacoes', 'gestores'];
  for (const table of tables) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`
        }
      });
      const data = await res.json();
      console.log(`TABLE ${table} - STATUS:`, res.status, "COUNT:", data.length);
      if (data.length > 0) {
        console.log(`FIRST ${table} RECORD:`, JSON.stringify(data[0], null, 2));
      }
    } catch (err) {
      console.error(`ERROR ON TABLE ${table}:`, err);
    }
  }
}

testAll();
