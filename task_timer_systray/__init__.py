from . import models


def post_init_hook(env):
    env.cr.execute("""
        CREATE INDEX IF NOT EXISTS account_analytic_line_employee_date_task_idx
        ON account_analytic_line (employee_id, date, task_id)
        WHERE task_id IS NOT NULL
    """)
