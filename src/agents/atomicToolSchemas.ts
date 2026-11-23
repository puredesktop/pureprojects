import type {
  AppOperationExposure,
  AppOperationRisk,
} from '@purescience/platform-ui/bridge/appFunctions'

export interface AtomicToolSchemaSpec {
  name: string
  exposure: AppOperationExposure
  category: string
  risk: AppOperationRisk
  requiresApproval: boolean
  releaseButton?: string
  deletesPermanently?: boolean
  riskWhen?: Record<string, 'write' | 'destructive' | 'external' | 'release'>
  requiresCapabilities?: Array<'vision'>
  description: string
  inputSchema: Record<string, unknown> & { type: 'object' }
}

/**
 * All 23 atomic PureProjects tools with 3-tier exposure metadata:
 *   - "always" (6): core ~26% read/write verbs + permanent-delete `deleteProject`
 *     exposed directly in plugin.json.
 *   - "extended" (17): specialist project/deliverable/wait/journal/document/link/export
 *     tools discoverable via `discoverAppTools` and callable via `callExtendedReadTool` /
 *     `callExtendedTool` with zero loss of functionality.
 */
export const PUREPROJECTS_ATOMIC_TOOL_SCHEMAS: readonly AtomicToolSchemaSpec[] = [
  // ── Core atomic tools (exposure: 'always') ───────────────────────────────
  {
    name: 'getProjectsContext',
    exposure: 'always',
    category: 'projects',
    risk: 'read',
    requiresApproval: false,
    description:
      'Overview of projects, including openProject (the project currently on screen), totals by status, overdue work, waits and missing next actions. Call first. Unqualified add/todo requests target openProject; act without asking for optional owner or date details.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'listProjects',
    exposure: 'always',
    category: 'projects',
    risk: 'read',
    requiresApproval: false,
    description:
      'List projects with their status, next action, people, due date and area. Filter by status, area, or a free-text query. Use before proposing changes so ids and current values are exact.',
    inputSchema: {
      type: 'object',
      properties: {
        archived: {
          type: 'boolean',
          description:
            'List archived projects instead of live ones. Archived projects are out of view by default.',
        },
        status: {
          type: 'string',
          enum: ['idea', 'active', 'waiting', 'done'],
          description: 'Only projects in this state.',
        },
        area: {
          type: 'string',
          description: 'Only projects in this area.',
        },
        query: {
          type: 'string',
          description: 'Free-text match on name, next action, or people.',
        },
      },
    },
  },
  {
    name: 'getProject',
    exposure: 'always',
    category: 'projects',
    risk: 'read',
    requiresApproval: false,
    description:
      'One project in full: description, deliverables with owners and due dates, journal entries, linked documents, and what it is waiting on.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project id from listProjects.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'updateProject',
    exposure: 'always',
    category: 'projects',
    risk: 'write',
    requiresApproval: true,
    description:
      "Change a project's status, next action, due date, area, summary or people. Only the fields you pass are changed.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        name: {
          type: 'string',
        },
        summary: {
          type: 'string',
        },
        area: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['idea', 'active', 'waiting', 'done'],
        },
        nextAction: {
          type: 'string',
        },
        dueAt: {
          type: 'string',
          description: 'ISO date, or an empty string to clear it.',
        },
        people: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'addDeliverable',
    exposure: 'always',
    category: 'deliverables',
    risk: 'write',
    requiresApproval: true,
    description:
      'Add a todo/deliverable. An unqualified request such as add X targets the currently open project: omit projectId to use it. Act without asking for optional details; omit owner for the user and dueAt when no date was given.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'Explicit target project id. Omit to use the currently open project.',
        },
        title: {
          type: 'string',
          description: 'What gets delivered.',
        },
        owner: {
          type: 'string',
          description: 'Who owes it. Omit for the user.',
        },
        dueAt: {
          type: 'string',
          description: 'ISO date. Omit when no deadline was given.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'deleteProject',
    exposure: 'always',
    category: 'projects',
    risk: 'destructive',
    requiresApproval: true,
    deletesPermanently: true,
    description:
      'Delete a project permanently, with its deliverables, journal and links. This cannot be undone - prefer archiveProject, which puts it out of view and keeps the whole record. Only delete when the user asks to remove something outright.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        name: {
          type: 'string',
          description:
            "The project's exact current name, as a guard against deleting the wrong one.",
        },
      },
      required: ['projectId', 'name'],
    },
  },

  // ── Extended specialist tools (exposure: 'extended') ─────────────────────
  // Category: projects
  {
    name: 'createProject',
    exposure: 'extended',
    category: 'projects',
    risk: 'write',
    requiresApproval: true,
    description:
      'Create a project. Name it the way the user refers to it. Set area, due date and next action when they are known - a project with no next action is the state that quietly kills knowledge work.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name.',
        },
        summary: {
          type: 'string',
          description: 'One or two sentences on what this project is.',
        },
        area: {
          type: 'string',
          description: 'Grouping such as Writing, Clients, Admin.',
        },
        nextAction: {
          type: 'string',
          description: 'The single next physical step.',
        },
        dueAt: {
          type: 'string',
          description: 'ISO date the project is due.',
        },
        people: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'People involved, by name.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'reorderProject',
    exposure: 'extended',
    category: 'projects',
    risk: 'write',
    requiresApproval: true,
    description:
      'Move a project in the list. The list keeps the arrangement afterwards rather than sorting by urgency, so only do this when the user asks for an order - not to tidy.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        at: {
          type: 'string',
          enum: ['top', 'bottom', 'before', 'after'],
          description: 'Defaults to top.',
        },
        targetProjectId: {
          type: 'string',
          description: 'Required when at is before or after.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'archiveProject',
    exposure: 'extended',
    category: 'projects',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Put a project out of view without losing anything. Its status, deliverables, waits, journal and documents all stay exactly as they are, and it can be made active again at any time. This is what to do with work that is finished, abandoned or parked - prefer it over deleteProject, which destroys the record.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        archived: {
          type: 'boolean',
          description:
            'true to archive, false to bring it back into view. Defaults to true.',
        },
      },
      required: ['projectId'],
    },
  },

  // Category: deliverables
  {
    name: 'updateDeliverable',
    exposure: 'extended',
    category: 'deliverables',
    risk: 'write',
    requiresApproval: true,
    description:
      'Complete, reopen, retitle, reassign, or re-date a single deliverable on a project. Call getProject first to verify the deliverableId; completing the deliverable that matches nextAction clears nextAction.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        deliverableId: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        owner: {
          type: 'string',
        },
        dueAt: {
          type: 'string',
        },
        done: {
          type: 'boolean',
          description: 'true completes it, false reopens it.',
        },
      },
      required: ['projectId', 'deliverableId'],
    },
  },
  {
    name: 'moveDeliverable',
    exposure: 'extended',
    category: 'deliverables',
    risk: 'write',
    requiresApproval: true,
    description:
      'Move a deliverable to another project, unchanged: same title, owner, date and done state. The source project forgets it (and its next action, if that was it); the target lists it last. Use getProject for deliverable ids and listProjects for project ids.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project the deliverable is in now.',
        },
        deliverableId: {
          type: 'string',
        },
        toProjectId: {
          type: 'string',
          description: 'The project it moves to.',
        },
      },
      required: ['projectId', 'deliverableId', 'toProjectId'],
    },
  },
  {
    name: 'removeDeliverable',
    exposure: 'extended',
    category: 'deliverables',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Remove a deliverable from a project. To mark one finished use updateDeliverable with done - removing it discards the record that it existed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        deliverableId: {
          type: 'string',
        },
      },
      required: ['projectId', 'deliverableId'],
    },
  },

  // Category: waits
  {
    name: 'setWaitingOn',
    exposure: 'extended',
    category: 'waits',
    risk: 'write',
    requiresApproval: true,
    description:
      "Record that a project is waiting on someone, or clear a wait that arrived. Waits stack: passing person ADDS one. Passing resolveWaitingId clears that one; passing neither clears them all. The status follows the list — the project is 'waiting' while any remain and returns to 'active' when the last clears.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        person: {
          type: 'string',
          description:
            'Who owes it. Adds a wait — a project can be waiting on several people at once, so this never replaces an existing one.',
        },
        what: {
          type: 'string',
          description: 'What is owed.',
        },
        askedAt: {
          type: 'string',
          description: 'ISO date they were asked. Defaults to today.',
        },
        resolveWaitingId: {
          type: 'string',
          description:
            'Id of the wait that arrived (waitingId from listProjects/getProject). Omit both this and person to clear every outstanding wait.',
        },
      },
      required: ['projectId'],
    },
  },

  // Category: journal
  {
    name: 'logJournalEntry',
    exposure: 'extended',
    category: 'journal',
    risk: 'write',
    requiresApproval: true,
    description:
      "Append a dated entry to a project's journal: a decision made, a milestone reached, something that changed. The journal is append-only and is the project's memory - write what a colleague would need to understand the decision months later, not a list of activity.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        title: {
          type: 'string',
          description: 'One line naming what happened.',
        },
        body: {
          type: 'string',
          description: 'Two or three sentences of substance.',
        },
      },
      required: ['projectId', 'title'],
    },
  },

  // Category: documents
  {
    name: 'createDocument',
    exposure: 'extended',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    description:
      'Write a new document for a project. Creates a real PureWriter .document package in PureDocuments and links it to the project, so the user can open it here or in Writer, and other agents can find it through context search. Use this when the user asks for notes, a brief, an outline or a draft that belongs to a project - not for content that belongs in the journal.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        title: {
          type: 'string',
          description: 'Document title; also the package name.',
        },
        html: {
          type: 'string',
          description:
            'Optional initial content as simple HTML (h1/h2/p/ul/ol/blockquote). Omit for an empty document with a heading.',
        },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'readDocument',
    exposure: 'extended',
    category: 'documents',
    risk: 'read',
    requiresApproval: false,
    description:
      "Read a linked .document package as a numbered list of blocks. Call getProjectsContext first and getProject for linked paths. Call this before editing one: block indexes are how the edit tools address content, and they shift after every insert or delete. For a long document pass fromIndex and limit to read a stretch; blockCount is always the whole document's.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            "The document's path, as listed on the project by getProject.",
        },
        fromIndex: {
          type: 'number',
          description: 'Optional. First block to return. Defaults to 0.',
        },
        limit: {
          type: 'number',
          description:
            'Optional. Most blocks to return. Omit for every block from fromIndex on.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'insertDocumentBlock',
    exposure: 'extended',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    description:
      "Add a block to a linked document. Call getProjectsContext first. Pass html for prose, or mermaid for a diagram - give the diagram source only (for example 'graph TD; A --> B;') and it is wrapped as a diagram the editor renders. Defaults to the end of the document. Replies with what changed: the block count, the index it touched, the blocks it wrote and how later indexes shifted, not the whole document; call readDocument for the full block list.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        html: {
          type: 'string',
          description: 'Block HTML, e.g. <p>...</p> or <h2>...</h2>.',
        },
        mermaid: {
          type: 'string',
          description:
            'Mermaid diagram source. Use instead of html for a diagram.',
        },
        at: {
          type: 'string',
          enum: ['end', 'before', 'after'],
          description: 'Where to put it. Defaults to end.',
        },
        index: {
          type: 'number',
          description:
            'The block to insert before or after. Required unless at is end.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'replaceDocumentBlock',
    exposure: 'extended',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    description:
      'Replace one block of a linked document, leaving the rest untouched. Call getProjectsContext first. Pass html, or mermaid to make the block a diagram. Replies with what changed: the block count, the index it touched, the blocks it wrote and how later indexes shifted, not the whole document; call readDocument for the full block list.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        index: {
          type: 'number',
          description: 'Block index from readDocument.',
        },
        html: {
          type: 'string',
        },
        mermaid: {
          type: 'string',
        },
      },
      required: ['path', 'index'],
    },
  },
  {
    name: 'deleteDocumentBlock',
    exposure: 'extended',
    category: 'documents',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Delete one block of a linked document. Call getProjectsContext first. Removing a block discards its content - to reword something use replaceDocumentBlock instead. Replies with the new block count and how later indexes shifted, not the whole document.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        index: {
          type: 'number',
          description: 'Block index from readDocument.',
        },
      },
      required: ['path', 'index'],
    },
  },

  // Category: links
  {
    name: 'linkDocument',
    exposure: 'extended',
    category: 'links',
    risk: 'write',
    requiresApproval: true,
    description:
      'Attach reference material to a project: a document or other resource in the workspace, or a page on the web by its address. Call getProjectsContext first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        label: {
          type: 'string',
          description: 'How it should read in the list.',
        },
        path: {
          type: 'string',
          description:
            'Workspace path of the resource, or an https:// address for a page on the web.',
        },
        kind: {
          type: 'string',
          enum: ['document', 'mail', 'event', 'web'],
          description:
            'document, mail, event, or web. Optional — an http(s) path is treated as web regardless.',
        },
      },
      required: ['projectId', 'label', 'path'],
    },
  },
  {
    name: 'removeLink',
    exposure: 'extended',
    category: 'links',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Unlink a document, mail thread or event from a project. The document itself is untouched - only the link is removed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
        },
        linkId: {
          type: 'string',
        },
      },
      required: ['projectId', 'linkId'],
    },
  },

  // Category: exports
  {
    name: 'exportDocumentsPdf',
    exposure: 'extended',
    category: 'exports',
    risk: 'write',
    requiresApproval: true,
    description:
      "Convert a project's documents to PDF, written beside each document in the workspace. Call getProjectsContext first. Only documents created in this app can be converted; files attached to the project are already whatever they are and are reported as skipped. Omit paths to convert every document on the project.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Defaults to the open project.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document paths from getProject. Omit for all of them.',
        },
      },
    },
  },
  {
    name: 'exportProjectZip',
    exposure: 'extended',
    category: 'exports',
    risk: 'write',
    requiresApproval: true,
    description:
      "Bundle a project's documents into a zip in the workspace Documents folder. Call getProjectsContext first. Documents created here go in as PDFs; attached files go in as themselves. The result returns the saved path.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Defaults to the open project.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document paths from getProject. Omit for all of them.',
        },
      },
    },
  },
] as const
