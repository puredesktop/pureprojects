/**
 * Registering PureProjects' exposed operations with the platform:
 *   - 6 composite `fn_*` functions (always exposed)
 *   - 6 core atomic tools (~26% of 23, including permanent-delete `deleteProject`, always exposed)
 *   - 3 universal escape-hatch meta-tools (`discoverAppTools`,
 *     `callExtendedReadTool`, `callExtendedTool`) giving full on-demand access
 *     to all 17 specialist atomic tools.
 */
import { useMemo, useRef } from 'react'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentProjectsToolError,
  EXPOSED_TOOL_NAMES,
  PUREPROJECTS_AGENT_LOG_LABEL,
  type ProjectsAgentToolContext,
} from '../agents/catalog'

// Loading registry + document tooling is deferred until a tool is invoked.
export function useProjectsAgentTools(
  ready: boolean,
  context: ProjectsAgentToolContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  const registryHandlersRef = useRef<Promise<Record<string, AgentToolHandler>> | null>(
    null,
  )

  const getRegistryHandlers = () => {
    if (!registryHandlersRef.current) {
      registryHandlersRef.current = import('../agents/operationsRegistry').then(
        mod => mod.buildPureProjectsHandlers(() => contextRef.current),
      )
    }
    return registryHandlersRef.current
  }

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) => {
            const map = await getRegistryHandlers()
            return map[name]!(invoke)
          },
        ]),
      ),
    [],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PUREPROJECTS_AGENT_LOG_LABEL,
    errorType: AgentProjectsToolError,
    handlers,
  })
}
