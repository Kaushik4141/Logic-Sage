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
router.post('/api/webhooks/jira', (req: Request, res: Response) => {
  const { issue } = req.body || {};
  
  if (issue && issue.key) {
    const payload = {
      type: 'JIRA_ASSIGN',
      ticket: issue.key
    };
    broadcast(payload);
  }

  res.status(200).send('OK');
});

export default router;
