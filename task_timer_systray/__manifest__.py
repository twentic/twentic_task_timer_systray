{
    'name': 'Task Timer Systray',
    'version': '19.0.1.0.2',
    'author': 'TwenTIC',
    'category': 'Project',
    'summary': 'Track and control your task timers right from the systray — no need to open each task.',
    'depends': [
        'project',
        'hr_timesheet',
        'timer',
    ],
    'license': 'LGPL-3',
    'data': [],
    'assets': {
        'web.assets_backend': [
            'task_timer_systray/static/src/task_timer_systray.js',
            'ask_timer_systray/static/src/task_timer_systray.xml',
            'task_timer_systray/static/src/task_timer_systray.scss',
        ],
        'web.assets_web_dark': [
            'task_timer_systray/static/src/task_timer_systray.dark.scss',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'installable': True,
    'application': False,
    'auto_install': False,
}
