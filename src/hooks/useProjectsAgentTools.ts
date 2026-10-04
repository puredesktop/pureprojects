import { useRef } from 'react'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentProjectsToolError,
  PUREPROJECTS_AGENT_LOG_LABEL,
  PUREPROJECTS_AGENT_TOOL_NAMES,
  type ProjectsAgentToolContext,
} from '../agents/catalog'
// Loading document tooling is deferred until a tool is invoked.

export function useProjectsAgentTools(
  ready: boolean,
  context: ProjectsAgentToolContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  usePlatformAgentTools({
    ready,
    tools: PUREPROJECTS_AGENT_TOOL_NAMES,
    logLabel: PUREPROJECTS_AGENT_LOG_LABEL,
    errorType: AgentProjectsToolError,
    handlers: {
      getProjectsContext: async () =>
        (await import('../agents/handlers')).getProjectsContextHandler(
          contextRef.current,
        ),
      listProjects: async invoke =>
        (await import('../agents/handlers')).listProjectsHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      getProject: async invoke =>
        (await import('../agents/handlers')).getProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      createProject: async invoke =>
        (await import('../agents/handlers')).createProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      updateProject: async invoke =>
        (await import('../agents/handlers')).updateProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      addDeliverable: async invoke =>
        (await import('../agents/handlers')).addDeliverableHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      updateDeliverable: async invoke =>
        (await import('../agents/handlers')).updateDeliverableHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      setWaitingOn: async invoke =>
        (await import('../agents/handlers')).setWaitingOnHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      logJournalEntry: async invoke =>
        (await import('../agents/handlers')).logJournalEntryHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      createDocument: async invoke =>
        (await import('../agents/handlers')).createDocumentHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      readDocument: async invoke =>
        (await import('../agents/handlers')).readDocumentHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      insertDocumentBlock: async invoke =>
        (await import('../agents/handlers')).insertDocumentBlockHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      replaceDocumentBlock: async invoke =>
        (await import('../agents/handlers')).replaceDocumentBlockHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      deleteDocumentBlock: async invoke =>
        (await import('../agents/handlers')).deleteDocumentBlockHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      exportDocumentsPdf: async invoke =>
        (await import('../agents/handlers')).exportDocumentsPdfHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      exportProjectZip: async invoke =>
        (await import('../agents/handlers')).exportProjectZipHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      reorderProject: async invoke =>
        (await import('../agents/handlers')).reorderProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      linkDocument: async invoke =>
        (await import('../agents/handlers')).linkDocumentHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      removeLink: async invoke =>
        (await import('../agents/handlers')).removeLinkHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      removeDeliverable: async invoke =>
        (await import('../agents/handlers')).removeDeliverableHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      moveDeliverable: async invoke =>
        (await import('../agents/handlers')).moveDeliverableHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      archiveProject: async invoke =>
        (await import('../agents/handlers')).archiveProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
      deleteProject: async invoke =>
        (await import('../agents/handlers')).deleteProjectHandler(
          contextRef.current,
          invoke.arguments ?? {},
        ),
    },
  })
}
