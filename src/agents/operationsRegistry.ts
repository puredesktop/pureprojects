import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PUREPROJECTS_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  AgentProjectsToolError,
  type ProjectsAgentToolContext,
} from './catalog'
import { PUREPROJECTS_FUNCTIONS } from './functions'
import {
  addDeliverableHandler,
  archiveProjectHandler,
  createDocumentHandler,
  createProjectHandler,
  deleteDocumentBlockHandler,
  deleteProjectHandler,
  exportDocumentsPdfHandler,
  exportProjectZipHandler,
  getProjectHandler,
  getProjectsContextHandler,
  insertDocumentBlockHandler,
  linkDocumentHandler,
  listProjectsHandler,
  logJournalEntryHandler,
  moveDeliverableHandler,
  readDocumentHandler,
  removeDeliverableHandler,
  removeLinkHandler,
  reorderProjectHandler,
  replaceDocumentBlockHandler,
  setWaitingOnHandler,
  updateDeliverableHandler,
  updateProjectHandler,
} from './handlers'

type AtomicRunner = (
  ctx: ProjectsAgentToolContext,
  args: Record<string, unknown>,
) => Promise<AgentToolHandlerResult>

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  getProjectsContext: ctx => getProjectsContextHandler(ctx),
  listProjects: (ctx, args) => listProjectsHandler(ctx, args),
  getProject: (ctx, args) => getProjectHandler(ctx, args),
  createProject: (ctx, args) => createProjectHandler(ctx, args),
  updateProject: (ctx, args) => updateProjectHandler(ctx, args),
  addDeliverable: (ctx, args) => addDeliverableHandler(ctx, args),
  updateDeliverable: (ctx, args) => updateDeliverableHandler(ctx, args),
  setWaitingOn: (ctx, args) => setWaitingOnHandler(ctx, args),
  logJournalEntry: (ctx, args) => logJournalEntryHandler(ctx, args),
  createDocument: (ctx, args) => createDocumentHandler(ctx, args),
  readDocument: (ctx, args) => readDocumentHandler(ctx, args),
  insertDocumentBlock: (ctx, args) => insertDocumentBlockHandler(ctx, args),
  replaceDocumentBlock: (ctx, args) => replaceDocumentBlockHandler(ctx, args),
  deleteDocumentBlock: (ctx, args) => deleteDocumentBlockHandler(ctx, args),
  exportDocumentsPdf: (ctx, args) => exportDocumentsPdfHandler(ctx, args),
  exportProjectZip: (ctx, args) => exportProjectZipHandler(ctx, args),
  reorderProject: (ctx, args) => reorderProjectHandler(ctx, args),
  linkDocument: (ctx, args) => linkDocumentHandler(ctx, args),
  removeLink: (ctx, args) => removeLinkHandler(ctx, args),
  removeDeliverable: (ctx, args) => removeDeliverableHandler(ctx, args),
  moveDeliverable: (ctx, args) => moveDeliverableHandler(ctx, args),
  archiveProject: (ctx, args) => archiveProjectHandler(ctx, args),
  deleteProject: (ctx, args) => deleteProjectHandler(ctx, args),
}

const atomicTools: AppAtomicToolDefinition<ProjectsAgentToolContext>[] =
  PUREPROJECTS_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<ProjectsAgentToolContext>({
      ...schema,
      run: async (ctx, args) => {
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new AgentProjectsToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, args)
      },
    }),
  )

/**
 * PureProjects' unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 6 composite `function` workflows (`fn_*`, always exposed)
 *   - 6 core atomic tools (~26% of 23, including permanent-delete `deleteProject`, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 17 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PUREPROJECTS_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<ProjectsAgentToolContext>({
    appSlug: 'projects',
    appName: 'PureProjects',
    functions: PUREPROJECTS_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureProjectsHandlers(
  getCtx: () => ProjectsAgentToolContext,
  options: BuildHandlersOptions<ProjectsAgentToolContext> = {},
): Record<string, AgentToolHandler> {
  return PUREPROJECTS_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new AgentProjectsToolError(message),
    ...options,
  })
}
