/* @odoo-module */

import { Component, useState, onWillStart, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";

const { DateTime } = luxon;

// Auto-refresh interval (ms)
const REFRESH_INTERVAL = 60000;

export class TaskTimerSystray extends Component {
    static template = "tw_task_timer_systray.TaskTimerSystray";
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");

        this.state = useState({
            tasks: [],
            isOpen: false,
            loading: false,
            serverOffset: 0, // difference in seconds between client and server
            tick: 0,         // incremented every second to force re-render of live timers
        });

        // Close dropdown on outside click
        this._onDocClick = (ev) => {
            if (this.state.isOpen && !this.__owl__.bdom?.el?.contains(ev.target)) {
                this.state.isOpen = false;
            }
        };
        document.addEventListener("click", this._onDocClick);

        // Tick every second to update live elapsed time displays
        this._tickInterval = setInterval(() => {
            if (this.state.isOpen) {
                this.state.tick++;
            }
        }, 1000);

        // Periodic data refresh
        this._refreshInterval = setInterval(() => {
            this._fetchTasks();
        }, REFRESH_INTERVAL);

        onWillStart(async () => {
            // Sync server time offset to keep elapsed timers accurate
            const serverTimeStr = await this.orm.call("timer.timer", "get_server_time", []);
            const serverTime = deserializeDateTime(serverTimeStr);
            const localTime = DateTime.now().setZone("utc");
            this.state.serverOffset = localTime.diff(serverTime).as("seconds");

            await this._fetchTasks();
        });

        onWillUnmount(() => {
            document.removeEventListener("click", this._onDocClick);
            clearInterval(this._tickInterval);
            clearInterval(this._refreshInterval);
        });
    }

    async _fetchTasks() {
        try {
            const tasks = await this.orm.call(
                "project.task",
                "get_today_tasks_for_systray",
                []
            );
            this.state.tasks = tasks;
        } catch (e) {
            console.error("[tw_task_timer_systray] Error loading tasks:", e);
        }
    }

    // ─── Getters ────────────────────────────────────────────────────────────────

    get labels() {
        return {
            todaysTasks:    _t("Today's tasks"),
            noTasksToday:   _t("No tasks started today"),
            running:        _t("Running"),
            paused:         _t("Paused"),
            completedToday: _t("Completed today"),
            pause:          _t("Pause"),
            stop:           _t("Stop"),
            resume:         _t("Resume"),
            start:          _t("Start"),
        };
    }

    get runningCount() {
        return this.state.tasks.filter((t) => t.timer_state === "running").length;
    }

    /**
     * Returns the elapsed time for a task as HH:MM:SS.
     * Recomputed every second via the reactive tick counter.
     */
    elapsedTime(task) {
        void this.state.tick; // reactive dependency

        if (!task.timer_start) {
            return "00:00:00";
        }

        const start = deserializeDateTime(task.timer_start).setZone("utc");
        let elapsedSeconds;

        if (task.timer_state === "running") {
            const now = DateTime.now().setZone("utc").minus({ seconds: this.state.serverOffset });
            elapsedSeconds = now.diff(start).as("seconds");
        } else if (task.timer_state === "paused" && task.timer_pause) {
            const pause = deserializeDateTime(task.timer_pause).setZone("utc");
            elapsedSeconds = pause.diff(start).as("seconds");
        } else {
            return "00:00:00";
        }

        if (elapsedSeconds < 0) elapsedSeconds = 0;

        const h = Math.floor(elapsedSeconds / 3600);
        const m = Math.floor((elapsedSeconds % 3600) / 60);
        const s = Math.floor(elapsedSeconds % 60);
        return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
    }

    // ─── Handlers ───────────────────────────────────────────────────────────────

    toggleDropdown(ev) {
        ev.stopPropagation();
        this.state.isOpen = !this.state.isOpen;
        if (this.state.isOpen) {
            this._fetchTasks();
        }
    }

    async _doTimerAction(taskId, method, ev) {
        if (ev) ev.stopPropagation();
        this.state.loading = true;
        try {
            const result = await this.orm.call("project.task", method, [[taskId]]);
            // action_timer_stop returns a wizard action to confirm time spent
            if (result && result.type) {
                this.state.isOpen = false;
                await this.action.doAction(result);
            }
            await this._fetchTasks();
        } catch (e) {
            console.error(`[tw_task_timer_systray] Error calling ${method}:`, e);
        } finally {
            this.state.loading = false;
        }
    }

    onStart(task, ev) {
        if (ev) ev.stopPropagation();

        // Paused tasks need resume (not start) to avoid resetting elapsed time
        const method = task.timer_state === "paused" ? "action_timer_resume" : "action_timer_start";

        // If another task is already running, ask for confirmation before switching
        const runningTask = this.state.tasks.find(
            (t) => t.timer_state === "running" && t.id !== task.id
        );

        if (runningTask) {
            this.dialog.add(ConfirmationDialog, {
                title: _t("Switch active task"),
                body: sprintf(
                    _t('Task "%s" will be paused and "%s" will start. Do you want to continue?'),
                    runningTask.name,
                    task.name
                ),
                confirmLabel: _t("Confirm"),
                cancelLabel: _t("Cancel"),
                confirm: () => this._doTimerAction(task.id, method),
                cancel: () => {},
            });
        } else {
            return this._doTimerAction(task.id, method);
        }
    }

    onPause(task, ev) {
        return this._doTimerAction(task.id, "action_timer_pause", ev);
    }

    onStop(task, ev) {
        return this._doTimerAction(task.id, "action_timer_stop", ev);
    }

    openTask(task, ev) {
        ev.stopPropagation();
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "project.task",
            res_id: task.id,
            views: [[false, "form"]],
            target: "current",
        });
        this.state.isOpen = false;
    }
}

registry.category("systray").add("tw_task_timer_systray", {
    Component: TaskTimerSystray,
    sequence: 10,
});
