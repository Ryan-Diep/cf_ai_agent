export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { message, history } = await request.json();
    
    const analysisPrompt = `Analyze this user request and break it down into 3-5 clear steps needed to answer it well. Be specific.

User request: "${message}"

Provide a JSON response with this structure:
{
  "steps": [
    {"action": "Brief step description", "reasoning": "Why this step is needed"}
  ]
}`;

    const analysisResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You are a planning assistant. Always respond with valid JSON only.' },
        { role: 'user', content: analysisPrompt }
      ]
    });

    let workflow;
    try {
      workflow = JSON.parse(analysisResponse.response);
    } catch (e) {
      workflow = {
        steps: [
          { action: "Understanding the request", reasoning: "Analyzing user input" },
          { action: "Gathering information", reasoning: "Collecting relevant context" },
          { action: "Formulating response", reasoning: "Creating comprehensive answer" }
        ]
      };
    }

    const executionPrompt = `You are an AI assistant that thinks step-by-step.

Conversation history:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}

Current request: "${message}"

Your plan:
${workflow.steps.map((s, i) => `${i + 1}. ${s.action}`).join('\n')}

Now execute this plan and provide a comprehensive, helpful response.`;

    const finalResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant that provides thorough, well-reasoned answers.' },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: executionPrompt }
      ]
    });

    const workflowWithResults = {
      steps: workflow.steps.map(step => ({
        action: step.action,
        result: step.reasoning || "Completed"
      }))
    };

    return new Response(JSON.stringify({ 
      response: finalResponse.response,
      workflow: workflowWithResults
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      response: "I encountered an error processing your request. Please try again."
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}