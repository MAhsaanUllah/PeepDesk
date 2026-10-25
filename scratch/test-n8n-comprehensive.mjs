import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isN8nWorkflowJson,
  parseN8nWorkflowJson,
  parseBoardJson
} from '../dist/renderer/canvas/components/board-export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(cond, desc) {
  if (cond) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}`);
    failed++;
  }
}

console.log('================================================================');
console.log('=== PEEPJAM N8N WORKFLOW IMPORT & SECURITY TEST SUITE ===');
console.log('================================================================\n');

// 1. Branching Workflow Fixture (1 source -> 3 downstream nodes)
const branchingFixture = {
  name: 'Multi-Branch Alert Dispatcher',
  nodes: [
    {
      id: 'node-webhook-1',
      name: 'Webhook Inbound',
      type: 'n8n-nodes-base.webhook',
      position: [100, 200]
    },
    {
      id: 'node-slack-2',
      name: 'Slack Notification',
      type: 'n8n-nodes-base.slack',
      position: [450, 100]
    },
    {
      id: 'node-email-3',
      name: 'Email Admin',
      type: 'n8n-nodes-base.emailSend',
      position: [450, 250]
    },
    {
      id: 'node-pager-4',
      name: 'PagerDuty Alert',
      type: 'n8n-nodes-base.pagerDuty',
      position: [450, 400]
    }
  ],
  connections: {
    'Webhook Inbound': {
      main: [
        [
          { node: 'Slack Notification', type: 'main', index: 0 },
          { node: 'Email Admin', type: 'main', index: 0 },
          { node: 'PagerDuty Alert', type: 'main', index: 0 }
        ]
      ]
    }
  }
};

console.log('--- 1. Branching Workflows (1-to-many connections) ---');
const branchResult = parseN8nWorkflowJson(JSON.stringify(branchingFixture));
assert(branchResult.items.length === 7, `Created 7 total canvas elements (4 nodes + 3 connectors, got ${branchResult.items.length})`);
const branchConnectors = branchResult.items.filter(i => i.type === 'connector');
assert(branchConnectors.length === 3, `Generated exactly 3 connectors for 3 branches (got ${branchConnectors.length})`);
assert(branchConnectors.every(c => c.startElementId === 'n8n-node-webhook-1'), 'All 3 branch connectors link back to source Webhook node');
const targetIds = branchConnectors.map(c => c.endElementId).sort();
assert(
  targetIds.includes('n8n-node-slack-2') &&
  targetIds.includes('n8n-node-email-3') &&
  targetIds.includes('n8n-node-pager-4'),
  'All 3 downstream targets correctly attached: Slack, Email, PagerDuty'
);

// 2. Multiple Outputs (e.g. IF condition node with main[0] and main[1])
console.log('\n--- 2. Multiple Distinct Outputs (IF/Conditional Logic) ---');
const ifFixture = {
  name: 'Approval Gate Flow',
  nodes: [
    {
      id: 'if-eval-1',
      name: 'Evaluate Budget',
      type: 'n8n-nodes-base.if',
      position: [200, 200]
    },
    {
      id: 'app-approve-2',
      name: 'Approve Request',
      type: 'n8n-nodes-base.httpRequest',
      position: [550, 100]
    },
    {
      id: 'app-reject-3',
      name: 'Reject Request',
      type: 'n8n-nodes-base.httpRequest',
      position: [550, 300]
    }
  ],
  connections: {
    'Evaluate Budget': {
      main: [
        // Output index 0: True branch
        [{ node: 'Approve Request', type: 'main', index: 0 }],
        // Output index 1: False branch
        [{ node: 'Reject Request', type: 'main', index: 0 }]
      ]
    }
  }
};

const ifResult = parseN8nWorkflowJson(JSON.stringify(ifFixture));
assert(ifResult.items.length === 5, `Created 5 total elements for IF branches (3 nodes + 2 connectors, got ${ifResult.items.length})`);
const ifConnectors = ifResult.items.filter(i => i.type === 'connector');
assert(ifConnectors.length === 2, `Both output branches created connectors (got ${ifConnectors.length})`);
assert(
  ifConnectors.some(c => c.endElementId === 'n8n-app-approve-2') &&
  ifConnectors.some(c => c.endElementId === 'n8n-app-reject-3'),
  'Both true and false output branches resolved to their respective downstream nodes'
);

// 3. Missing Positions Handling (null, undefined, invalid coordinates)
console.log('\n--- 3. Missing or Non-Array Positions Handling ---');
const missingPosFixture = {
  name: 'Position-less Workflow',
  nodes: [
    { id: 'pos-1', name: 'Node Null Pos', type: 'n8n-nodes-base.noOp', position: null },
    { id: 'pos-2', name: 'Node Undefined Pos', type: 'n8n-nodes-base.noOp' },
    { id: 'pos-3', name: 'Node String Pos', type: 'n8n-nodes-base.noOp', position: 'invalid' },
    { id: 'pos-4', name: 'Node Empty Arr Pos', type: 'n8n-nodes-base.noOp', position: [] },
    { id: 'pos-5', name: 'Node NaN Pos', type: 'n8n-nodes-base.noOp', position: [NaN, NaN] }
  ]
};

const posResult = parseN8nWorkflowJson(JSON.stringify(missingPosFixture));
assert(posResult.items.length === 5, 'All 5 nodes created despite missing/corrupt positions');
assert(
  posResult.items.every(n => typeof n.x === 'number' && Number.isFinite(n.x) && typeof n.y === 'number' && Number.isFinite(n.y)),
  'All 5 nodes assigned valid finite coordinates without NaN'
);
// Verify nodes are arranged without complete overlap
const coords = posResult.items.map(n => `${n.x},${n.y}`);
const uniqueCoords = new Set(coords);
assert(uniqueCoords.size === 5, 'Automatic layout provided distinct coordinates for each position-less node');

// 4. Unsupported & Custom Community Node Types
console.log('\n--- 4. Unsupported & Custom Node Types ---');
const customTypesFixture = {
  name: 'Custom Community Flow',
  nodes: [
    { id: 'c-1', name: 'Legacy Plugin', type: 'n8n-nodes-legacy.specialService', position: [100, 100] },
    { id: 'c-2', name: 'Community LLM', type: 'n8n-nodes-community-ai.mistral', position: [400, 100] },
    { id: 'c-3', name: 'Internal Service', type: 'com.enterprise.internal.authGateway', position: [700, 100] },
    { id: 'c-4', name: 'Unknown Type', type: 12345, position: [1000, 100] } // non-string type
  ]
};

const customResult = parseN8nWorkflowJson(JSON.stringify(customTypesFixture));
assert(customResult.items.length === 4, 'All custom and unsupported node types imported successfully');
assert(customResult.items[0].content.includes('special Service') || customResult.items[0].content.includes('specialService'), 'Clean type string formatted nicely');
assert(customResult.items.every(n => n.shapeType === 'rounded-rect'), 'All nodes consistently render as rounded-rect shape nodes');

// 5. Malformed JSON & Invalid Structures
console.log('\n--- 5. Malformed JSON & Error Resilience ---');
const malformedStrings = [
  '{ broken json [',
  '12345',
  '"just a string"',
  '[1, 2, 3]',
  'null',
  '{"onlyOtherKeys": true}',
  '{"nodes": "not an array"}'
];

let rejectedCount = 0;
for (const bad of malformedStrings) {
  try {
    parseN8nWorkflowJson(bad);
  } catch (err) {
    rejectedCount++;
  }
}
assert(rejectedCount === malformedStrings.length, `Safely rejected all ${malformedStrings.length} malformed JSON inputs with clean exceptions`);

// 6. Security: Credentials & Secret Parameters Leak Prevention
console.log('\n--- 6. Security: Zero Leakage of Credentials & Secrets ---');
const SECRET_OPENAI_KEY = 'sk-live-SUPER-SECRET-API-KEY-99999-ABCDEF';
const SECRET_PASSWORD = 'ProductionMasterPassword!2026';
const SECRET_AUTH_HEADER = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SecretPayload';
const SECRET_WEBHOOK_URL = 'https://admin:TopSecretToken987@webhook.internal.corp/secret';

const secretsFixture = {
  name: 'Secure Workflow With Live Credentials',
  nodes: [
    {
      id: 'auth-node',
      name: 'OpenAI Classifier',
      type: 'n8n-nodes-base.openAi',
      position: [100, 200],
      credentials: {
        openAiApi: {
          id: 'cred-12345',
          name: 'Main Prod Account',
          apiKey: SECRET_OPENAI_KEY
        }
      },
      parameters: {
        model: 'gpt-4o',
        systemPrompt: 'Classify incoming ticket',
        password: SECRET_PASSWORD,
        authorization: SECRET_AUTH_HEADER,
        endpoint: SECRET_WEBHOOK_URL
      }
    },
    {
      id: 'db-node',
      name: 'Database Query',
      type: 'n8n-nodes-base.postgres',
      position: [400, 200],
      credentials: {
        postgres: {
          user: 'postgres_admin',
          password: SECRET_PASSWORD,
          host: 'db.internal.corp'
        }
      }
    }
  ],
  connections: {
    'OpenAI Classifier': {
      main: [[{ node: 'Database Query', type: 'main', index: 0 }]]
    }
  }
};

const secretJsonString = JSON.stringify(secretsFixture);
// Verify that the input fixture DOES contain the secrets
assert(secretJsonString.includes(SECRET_OPENAI_KEY), 'Fixture verified to contain secret OpenAI API key');
assert(secretJsonString.includes(SECRET_PASSWORD), 'Fixture verified to contain secret password');

const sanitizedResult = parseN8nWorkflowJson(secretJsonString);
assert(sanitizedResult.items.length === 3, 'Imported 2 nodes and 1 connector from sensitive workflow');

// Deep check all properties of all generated items
const exportedResultString = JSON.stringify(sanitizedResult);

assert(!exportedResultString.includes(SECRET_OPENAI_KEY), 'CRITICAL: Secret OpenAI key never leaked into parsed canvas elements');
assert(!exportedResultString.includes(SECRET_PASSWORD), 'CRITICAL: Secret password never leaked into parsed canvas elements');
assert(!exportedResultString.includes(SECRET_AUTH_HEADER), 'CRITICAL: Authorization bearer token never leaked into parsed canvas elements');
assert(!exportedResultString.includes(SECRET_WEBHOOK_URL), 'CRITICAL: Sensitive webhook URL never leaked into parsed canvas elements');
assert(!exportedResultString.includes('credentials'), 'CRITICAL: Credentials property completely omitted from canvas items');
assert(!exportedResultString.includes('parameters'), 'CRITICAL: Node execution parameters completely omitted from canvas items');

// 7. Auto-detection in standard parseBoardJson
console.log('\n--- 7. Standard parseBoardJson Auto-Detection ---');
const autoDetected = parseBoardJson(secretJsonString);
assert(autoDetected.items.length === 3, 'parseBoardJson automatically detected n8n format and parsed without error');
assert(autoDetected.title === 'Secure Workflow With Live Credentials', 'Workflow title preserved');

console.log('\n================================================================');
console.log(`N8N IMPORT & SECURITY AUDIT: ${passed} PASS, ${failed} FAIL`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
