// mistralClient.js
import fetch from 'node-fetch';

export async function mistralChat(prompt) {
  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });

    const data = await res.json();
    return data.message?.content?.trim();
  } catch (err) {
    console.error('❌ Mistral chat error:', err.message);
    return '';
  }
}