import type { CanvasNode } from '../../../shared/types.js';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  badge?: string;
  items: CanvasNode[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'retro',
    name: 'Brainstorming Retrospective',
    description: '3-column agile retro: What Went Well, Could Improve, and Next Steps.',
    icon: '💡',
    badge: 'Popular',
    items: [
      // Section 1: What Went Well
      {
        id: 'sec-1',
        type: 'section',
        title: '🌟 What Went Well',
        x: 60,
        y: 80,
        width: 320,
        height: 480,
        content: '',
        color: 'rgba(20, 174, 92, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'st-1',
        type: 'sticky',
        x: 90,
        y: 160,
        width: 180,
        height: 180,
        content: 'Shipped offline whiteboard with zero latency! 🚀',
        color: '#85E0A3',
        textColor: '#053816',
        rotation: -1,
        author: 'You',
        createdAt: Date.now()
      },
      {
        id: 'st-2',
        type: 'sticky',
        x: 100,
        y: 350,
        width: 180,
        height: 150,
        content: 'Clean dark UI & smooth 60fps pan/zoom.',
        color: '#85E0A3',
        textColor: '#053816',
        rotation: 1.2,
        author: 'PeepDesk',
        createdAt: Date.now()
      },

      // Section 2: What Could Improve
      {
        id: 'sec-2',
        type: 'section',
        title: '🤔 What Could Improve',
        x: 420,
        y: 80,
        width: 320,
        height: 480,
        content: '',
        color: 'rgba(255, 199, 0, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'st-3',
        type: 'sticky',
        x: 450,
        y: 160,
        width: 180,
        height: 180,
        content: 'Need more template presets for system design.',
        color: '#FFF385',
        textColor: '#2A2700',
        rotation: 1,
        author: 'You',
        createdAt: Date.now()
      },

      // Section 3: Next Steps
      {
        id: 'sec-3',
        type: 'section',
        title: '🎯 Next Steps & Action Items',
        x: 780,
        y: 80,
        width: 320,
        height: 480,
        content: '',
        color: 'rgba(13, 153, 255, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'st-4',
        type: 'sticky',
        x: 810,
        y: 160,
        width: 180,
        height: 180,
        content: 'Export high-res diagram for team review. 📸',
        color: '#8CE8FF',
        textColor: '#033440',
        rotation: -1.2,
        author: 'You',
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 'flowchart',
    name: 'Flowchart / Logic Map',
    description: 'Decision flow with start node, decision diamond, and branching action steps.',
    icon: '⚡',
    badge: 'Diagram',
    items: [
      // Start Node
      {
        id: 'fc-start',
        type: 'shape',
        shapeType: 'rounded-rect',
        x: 80,
        y: 180,
        width: 160,
        height: 80,
        content: 'Start Action',
        fillColor: 'rgba(20, 174, 92, 0.20)',
        strokeColor: '#14AE5C',
        strokeWidth: 2,
        textColor: '#85E0A3',
        fontSize: 14,
        createdAt: Date.now()
      },
      // Connector 1
      {
        id: 'fc-conn-1',
        type: 'connector',
        startX: 240,
        startY: 220,
        endX: 360,
        endY: 220,
        x: 240,
        y: 220,
        width: 120,
        height: 0,
        content: '',
        color: '#9747FF',
        strokeWidth: 3,
        lineStyle: 'straight',
        arrowEnd: true,
        createdAt: Date.now()
      },
      // Decision Diamond
      {
        id: 'fc-diamond',
        type: 'shape',
        shapeType: 'diamond',
        x: 360,
        y: 140,
        width: 160,
        height: 160,
        content: 'Valid Request?',
        fillColor: 'rgba(151, 71, 255, 0.20)',
        strokeColor: '#9747FF',
        strokeWidth: 2,
        textColor: '#D3B5FF',
        fontSize: 13,
        createdAt: Date.now()
      },
      // Connector YES (curved down to dashboard)
      {
        id: 'fc-conn-yes',
        type: 'connector',
        startX: 520,
        startY: 200,
        endX: 680,
        endY: 130,
        x: 520,
        y: 130,
        width: 160,
        height: 70,
        content: 'YES',
        label: 'YES',
        color: '#14AE5C',
        strokeWidth: 3,
        lineStyle: 'curved',
        arrowEnd: true,
        createdAt: Date.now()
      },
      // Action YES
      {
        id: 'fc-action-yes',
        type: 'shape',
        shapeType: 'rounded-rect',
        x: 680,
        y: 90,
        width: 180,
        height: 80,
        content: 'Open Dashboard',
        fillColor: 'rgba(13, 153, 255, 0.20)',
        strokeColor: '#0D99FF',
        strokeWidth: 2,
        textColor: '#8CE8FF',
        fontSize: 14,
        createdAt: Date.now()
      },
      // Connector NO (curved down to error)
      {
        id: 'fc-conn-no',
        type: 'connector',
        startX: 520,
        startY: 240,
        endX: 680,
        endY: 310,
        x: 520,
        y: 240,
        width: 160,
        height: 70,
        content: 'NO',
        label: 'NO',
        color: '#F24822',
        strokeWidth: 3,
        lineStyle: 'curved',
        arrowEnd: true,
        createdAt: Date.now()
      },
      // Action NO
      {
        id: 'fc-action-no',
        type: 'shape',
        shapeType: 'rounded-rect',
        x: 680,
        y: 270,
        width: 180,
        height: 80,
        content: 'Display Error & Retry',
        fillColor: 'rgba(242, 72, 34, 0.20)',
        strokeColor: '#F24822',
        strokeWidth: 2,
        textColor: '#FFC7C7',
        fontSize: 14,
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 'kanban',
    name: 'Kanban Task Board',
    description: 'Visual task board with To Do, In Progress, and Completed columns.',
    icon: '📋',
    badge: 'Agile',
    items: [
      // To Do Section
      {
        id: 'kb-sec-todo',
        type: 'section',
        title: '📋 To Do',
        x: 60,
        y: 80,
        width: 300,
        height: 520,
        content: '',
        color: 'rgba(255, 199, 0, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'kb-card-1',
        type: 'sticky',
        x: 90,
        y: 150,
        width: 240,
        height: 140,
        content: 'Refactor canvas coordinate transform matrix for pinch zoom.',
        color: '#FFF385',
        textColor: '#2A2700',
        author: 'Lead Dev',
        createdAt: Date.now()
      },
      {
        id: 'kb-card-2',
        type: 'sticky',
        x: 90,
        y: 320,
        width: 240,
        height: 140,
        content: 'Add high-res SVG export option for print.',
        color: '#FFF385',
        textColor: '#2A2700',
        author: 'Design',
        createdAt: Date.now()
      },
      // In Progress Section
      {
        id: 'kb-sec-prog',
        type: 'section',
        title: '⚡ In Progress',
        x: 400,
        y: 80,
        width: 300,
        height: 520,
        content: '',
        color: 'rgba(13, 153, 255, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'kb-card-3',
        type: 'sticky',
        x: 430,
        y: 150,
        width: 240,
        height: 140,
        content: 'PeepJam style bottom dock toolbar with sub-popovers.',
        color: '#8CE8FF',
        textColor: '#033440',
        author: 'You',
        createdAt: Date.now()
      },
      // Done Section
      {
        id: 'kb-sec-done',
        type: 'section',
        title: '✅ Completed',
        x: 740,
        y: 80,
        width: 300,
        height: 520,
        content: '',
        color: 'rgba(20, 174, 92, 0.12)',
        createdAt: Date.now()
      },
      {
        id: 'kb-card-4',
        type: 'sticky',
        x: 770,
        y: 150,
        width: 240,
        height: 140,
        content: 'Dual persistence engine with local JSON and offline fallback.',
        color: '#85E0A3',
        textColor: '#053816',
        author: 'You',
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 'mindmap',
    name: 'Mind Map & Idea Cluster',
    description: 'Central concept radiating into interconnected idea nodes and connectors.',
    icon: '🧠',
    badge: 'Creative',
    items: [
      // Central Hub
      {
        id: 'mm-center',
        type: 'shape',
        shapeType: 'circle',
        x: 460,
        y: 220,
        width: 170,
        height: 170,
        content: '🚀 Core Vision',
        fillColor: 'rgba(151, 71, 255, 0.25)',
        strokeColor: '#C8F560',
        strokeWidth: 3,
        textColor: '#C8F560',
        fontSize: 16,
        createdAt: Date.now()
      },
      // Idea 1 (Top Left)
      {
        id: 'mm-node-1',
        type: 'sticky',
        x: 160,
        y: 70,
        width: 180,
        height: 140,
        content: '100% Offline & Private (Zero cloud dependencies)',
        color: '#85E0A3',
        textColor: '#053816',
        author: 'Architecture',
        createdAt: Date.now()
      },
      // Idea 2 (Top Right)
      {
        id: 'mm-node-2',
        type: 'sticky',
        x: 740,
        y: 70,
        width: 180,
        height: 140,
        content: 'Ultra-lightweight (<90MB RAM footprint)',
        color: '#8CE8FF',
        textColor: '#033440',
        author: 'Performance',
        createdAt: Date.now()
      },
      // Idea 3 (Bottom)
      {
        id: 'mm-node-3',
        type: 'sticky',
        x: 455,
        y: 470,
        width: 180,
        height: 140,
        content: 'PeepJam-grade tactile whiteboard interactions',
        color: '#D3B5FF',
        textColor: '#260B4C',
        author: 'UX',
        createdAt: Date.now()
      },
      // Connectors
      {
        id: 'mm-conn-1',
        type: 'connector',
        startX: 470,
        startY: 250,
        endX: 340,
        endY: 150,
        x: 340,
        y: 150,
        width: 130,
        height: 100,
        content: '',
        color: '#85E0A3',
        strokeWidth: 2.5,
        lineStyle: 'curved',
        arrowEnd: true,
        createdAt: Date.now()
      },
      {
        id: 'mm-conn-2',
        type: 'connector',
        startX: 610,
        startY: 250,
        endX: 740,
        endY: 150,
        x: 610,
        y: 150,
        width: 130,
        height: 100,
        content: '',
        color: '#8CE8FF',
        strokeWidth: 2.5,
        lineStyle: 'curved',
        arrowEnd: true,
        createdAt: Date.now()
      },
      {
        id: 'mm-conn-3',
        type: 'connector',
        startX: 545,
        startY: 390,
        endX: 545,
        endY: 470,
        x: 545,
        y: 390,
        width: 10,
        height: 80,
        content: '',
        color: '#D3B5FF',
        strokeWidth: 2.5,
        lineStyle: 'curved',
        arrowEnd: true,
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'A completely clean infinite dot-grid board ready for your ideas.',
    icon: '📄',
    items: []
  }
];
