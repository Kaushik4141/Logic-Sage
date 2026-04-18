import { Router, type Request, type Response } from 'express';

const router = Router();

// Store connected clients for SSE
const clients: Response[] = [];

// 1. GET /api/stream: An SSE endpoint that keeps the connection open
router.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);

  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// Helper function to broadcast messages
const broadcast = (data: any) => {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => client.write(message));
};

// 2. POST /api/webhooks/github: GitHub webhook payload
router.post('/api/webhooks/github', (req: Request, res: Response) => {
  const { action, pull_request } = req.body || {};

  if (action === 'closed' && pull_request && pull_request.merged === true) {
    const payload = {
      type: 'GITHUB_MERGE',
      branch: pull_request.head?.ref,
      developer: pull_request.user?.login
    };
    broadcast(payload);
  }

  res.status(200).send('OK');
});

// 3. POST /api/webhooks/jira: Jira webhook payload
// Persists ticket data to D1 via edge-api for auto-status tracking
const EDGE_API_URL = process.env.EDGE_API_URL || 'https://edge-api.kaushik0h0s.workers.dev';

router.post('/api/webhooks/jira', async (req: Request, res: Response) => {
  const { issue, transition } = req.body || {};
  
  if (issue && issue.key) {
    // Broadcast SSE event to connected clients
    const payload = {
      type: 'JIRA_ASSIGN',
      ticket: issue.key
    };
    broadcast(payload);

    // --- Persist to D1 via edge-api ---
    try {
      const assigneeEmail = issue.fields?.assignee?.emailAddress 
        ?? issue.fields?.assignee?.name 
        ?? 'unassigned';
      const title = issue.fields?.summary ?? issue.key;
      const ticketId = issue.key;

      // Create/update the task in D1
      await fetch(`${EDGE_API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          assignee_email: assigneeEmail,
          title: title,
          branch_pattern: ticketId.toLowerCase(),
        }),
      });
      console.log(`[Webhook] Task ${ticketId} persisted to D1 (assignee: ${assigneeEmail})`);

      // If Jira reports a "Done" transition, mark it done in D1
      const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
      const transitionName = transition?.to?.name?.toLowerCase() 
        ?? issue.fields?.status?.name?.toLowerCase();
      
      if (transitionName && doneStatuses.includes(transitionName)) {
        await fetch(`${EDGE_API_URL}/api/tasks/${encodeURIComponent(ticketId)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
        console.log(`[Webhook] Task ${ticketId} → DONE (Jira transition: ${transitionName})`);
      }
    } catch (err) {
      console.error('[Webhook] Failed to persist Jira ticket to D1:', err);
    }
  }

  res.status(200).send('OK');
});

export default router;
