"""Inventory genuine owned turns and subagents observed in CLI events.

Sessions remains the owner of durable state and process cancellation. A CLI
model-tool name is evidence of availability, not a deterministic control API.
"""

import re

from sessions import RunConflict, TERMINAL

TASK_TOOLS = {
    "schedule",
    "manage_task",
    "invoke_subagent",
    "manage_subagents",
    "send_message",
}
MAX_OBSERVED_SUBAGENTS = 128
CONVERSATION_ID = re.compile(
    r"(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-"
    r"[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\Z"
)


class TaskRuntime:
    def __init__(self, sessions):
        self.sessions = sessions

    def observe(self, run, event):
        """Normalize documented metadata before Sessions persists the run."""
        if event.get("event") == "init":
            payload = event.get("init")
            if isinstance(payload, dict) and isinstance(
                payload.get("tools"), list
            ):
                run["observed_task_tools"] = sorted(
                    {
                        tool
                        for tool in payload["tools"]
                        if isinstance(tool, str) and tool in TASK_TOOLS
                    }
                )
        elif event.get("event") == "step_update":
            step = event.get("step_update")
            if not isinstance(step, dict):
                return
            information = step.get("subagent_info")
            if not isinstance(information, dict):
                return
            agents = information.get("subagents")
            if not isinstance(agents, list):
                return
            observed = run.setdefault("observed_subagents", [])
            known = {agent["conversation_id"] for agent in observed}
            for agent in agents[:MAX_OBSERVED_SUBAGENTS]:
                if not isinstance(agent, dict):
                    continue
                identifier = agent.get("conversation_id")
                if not isinstance(
                    identifier, str
                ) or not CONVERSATION_ID.fullmatch(identifier):
                    continue
                if (
                    identifier in known
                    or len(observed) >= MAX_OBSERVED_SUBAGENTS
                ):
                    continue
                name = agent.get("type_name", "")
                if not isinstance(name, str):
                    name = ""
                name = "".join(
                    character
                    for character in name[:128]
                    if character.isprintable()
                )
                observed.append(
                    {"conversation_id": identifier, "type_name": name}
                )
                known.add(identifier)

    def detail(self, run_id):
        run = self.sessions.runs[run_id]
        row = {
            "task_id": run["run_id"],
            "run_id": run["run_id"],
            "session_id": run["session_id"],
            "kind": "conversation_turn",
            "state": run["state"],
            "created_at": run.get("created_at"),
            "completed_at": run.get("completed_at"),
            "cancellable": self.owned(run),
            "observed_tools": list(run.get("observed_task_tools", [])),
        }
        return row

    def owned(self, run):
        if run["state"] in TERMINAL:
            return False
        task = self.sessions.tasks.get(run["run_id"])
        # A session process alone cannot establish which turn owns its work.
        return task is not None and not task.done()

    def listing(self):
        runs = sorted(
            self.sessions.runs.values(),
            key=lambda run: run.get("created_at", 0),
            reverse=True,
        )
        agents = []
        for run in runs:
            for agent in run.get("observed_subagents", []):
                agents.append(
                    {
                        "conversation_id": agent["conversation_id"],
                        "type_name": agent["type_name"],
                        "parent_run_id": run["run_id"],
                        "parent_state": run["state"],
                        "state": "observed",
                        "cancellable": False,
                        "cancel_scope": "parent_run_only",
                    }
                )
        return {
            "tasks": [self.detail(run["run_id"]) for run in runs],
            "subagents": agents,
            "capabilities": {
                "owned_run_cancel": True,
                "observed_subagents": True,
                "independent_subagent_cancel": False,
                "native_schedule_crud": False,
                "current_turn_steering": False,
            },
        }

    async def cancel(self, run_id):
        run = self.sessions.runs[run_id]
        if run["state"] not in TERMINAL and not self.owned(run):
            raise RunConflict("No live owned process can confirm cancellation")
        await self.sessions.cancel(run_id)
        return self.detail(run_id)
