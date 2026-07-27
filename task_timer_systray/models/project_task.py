# -*- coding: utf-8 -*-
from odoo import models, fields, api


class ProjectTask(models.Model):
    _inherit = 'project.task'

    @api.model
    def get_today_tasks_for_systray(self):
        """
        Retorna les tasques amb activitat de timer avui per a l'usuari actual.
        Inclou:
          - Tasques amb timer actiu (running o paused)
          - Tasques amb apunts de timesheet d'avui
        """
        today = fields.Date.today()
        user = self.env.user

        # 1. Timers actius de l'usuari actual sobre project.task
        active_timers = self.env['timer.timer'].search([
            ('user_id', '=', user.id),
            ('res_model', '=', 'project.task'),
        ])
        timer_by_task = {t.res_id: t for t in active_timers}
        active_task_ids = list(timer_by_task.keys())

        # 2. Tasques amb timesheet avui — read_group evita carregar registres complets
        today_task_ids = []
        employee = self.env['hr.employee'].sudo().search(
            [('user_id', '=', user.id)], limit=1
        )
        if employee:
            rows = self.env['account.analytic.line']._read_group(
                [
                    ('date', '=', today),
                    ('employee_id', '=', employee.id),
                    ('task_id', '!=', False),
                ],
                groupby=['task_id'],
                aggregates=['__count'],
            )
            today_task_ids = [task.id for task, _count in rows]

        all_task_ids = list(set(active_task_ids + today_task_ids))
        if not all_task_ids:
            return []

        # .read() fa una sola query SQL; evita N+1 per project_id.name
        task_data = self.browse(all_task_ids).read(['name', 'project_id'])

        result = []
        for tv in task_data:
            timer = timer_by_task.get(tv['id'])

            timer_state = 'stopped'
            timer_start_str = False
            timer_pause_str = False

            if timer:
                if timer.timer_start and not timer.timer_pause:
                    timer_state = 'running'
                elif timer.timer_start and timer.timer_pause:
                    timer_state = 'paused'
                timer_start_str = fields.Datetime.to_string(timer.timer_start) if timer.timer_start else False
                timer_pause_str = fields.Datetime.to_string(timer.timer_pause) if timer.timer_pause else False

            project = tv.get('project_id')
            result.append({
                'id': tv['id'],
                'name': tv['name'],
                'project_name': project[1] if project else '',
                'timer_state': timer_state,
                'timer_start': timer_start_str,
                'timer_pause': timer_pause_str,
            })

        # Ordenar: running primer, paused, stopped al final
        order = {'running': 0, 'paused': 1, 'stopped': 2}
        result.sort(key=lambda t: order[t['timer_state']])
        return result
