import { useRef } from 'react'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentProjectsToolError,
  PUREPROJECTS_AGENT_LOG_LABEL,
  PUREPROJECTS_AGENT_TOOL_NAMES,
  type ProjectsAgentToolContext,
} from '../agents/catalog'
import {
  addDeliverableHandler,
  createDocumentHandler,
  deleteDocumentBlockHandler,
  exportDocumentsPdfHandler,
  exportProjectZipHandler,
  reorderProjectHandler,
  insertDocumentBlockHandler,
  readDocumentHandler,
  replaceDocumentBlockHandler,
  createProjectHandler,
  archiveProjectHandler,
  deleteProjectHandler,
  getProjectHandler,
  getProjectsContextHandler,
  linkDocumentHandler,
  listProjectsHandler,
  logJournalEntryHandler,
  moveDeliverableHandler,
  removeDeliverableHandler,
  removeLinkHandler,
  setWaitingOnHandler,
  updateDeliverableHandler,
  updateProjectHandler,
} from '../agents/handlers'

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
      getProjectsContext: async () => getProjectsContextHandler(contextRef.current),
      listProjects: async invoke =>
        listProjectsHandler(contextRef.current, invoke.arguments ?? {}),
      getProject: async invoke =>
        getProjectHandler(contextRef.current, invoke.arguments ?? {}),
      createProject: async invoke =>
        createProjectHandler(contextRef.current, invoke.arguments ?? {}),
      updateProject: async invoke =>
        updateProjectHandler(contextRef.current, invoke.arguments ?? {}),
      addDeliverable: async invoke =>
        addDeliverableHandler(contextRef.current, invoke.arguments ?? {}),
      updateDeliverable: async invoke =>
        updateDeliverableHandler(contextRef.current, invoke.arguments ?? {}),
      setWaitingOn: async invoke =>
        setWaitingOnHandler(contextRef.current, invoke.arguments ?? {}),
      logJournalEntry: async invoke =>
        logJournalEntryHandler(contextRef.current, invoke.arguments ?? {}),
      createDocument: async invoke =>
        createDocumentHandler(contextRef.current, invoke.arguments ?? {}),
      readDocument: async invoke =>
        readDocumentHandler(contextRef.current, invoke.arguments ?? {}),
      insertDocumentBlock: async invoke =>
        insertDocumentBlockHandler(contextRef.current, invoke.arguments ?? {}),
      replaceDocumentBlock: async invoke =>
        replaceDocumentBlockHandler(contextRef.current, invoke.arguments ?? {}),
      deleteDocumentBlock: async invoke =>
        deleteDocumentBlockHandler(contextRef.current, invoke.arguments ?? {}),
      exportDocumentsPdf: async invoke =>
        exportDocumentsPdfHandler(contextRef.current, invoke.arguments ?? {}),
      exportProjectZip: async invoke =>
        exportProjectZipHandler(contextRef.current, invoke.arguments ?? {}),
      reorderProject: async invoke =>
        reorderProjectHandler(contextRef.current, invoke.arguments ?? {}),
      linkDocument: async invoke =>
        linkDocumentHandler(contextRef.current, invoke.arguments ?? {}),
      removeLink: async invoke =>
        removeLinkHandler(contextRef.current, invoke.arguments ?? {}),
      removeDeliverable: async invoke =>
        removeDeliverableHandler(contextRef.current, invoke.arguments ?? {}),
      moveDeliverable: async invoke =>
        moveDeliverableHandler(contextRef.current, invoke.arguments ?? {}),
      archiveProject: async invoke =>
        archiveProjectHandler(contextRef.current, invoke.arguments ?? {}),
      deleteProject: async invoke =>
        deleteProjectHandler(contextRef.current, invoke.arguments ?? {}),
    },
  })
}
