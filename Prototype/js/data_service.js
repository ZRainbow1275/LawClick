/**
 * LawClick Data Service
 * Handles data persistence using localStorage to simulate a backend.
 */

const DataService = {
    init: function () {
        if (!localStorage.getItem('lawclick_data_initialized')) {
            this.seedData();
            localStorage.setItem('lawclick_data_initialized', 'true');
        }
    },

    seedData: function () {
        const tasks = [
            { id: 1, title: '审查《股权转让协议》', client: '科创未来科技', deadline: '今天 18:00', priority: 'high', completed: false },
            { id: 2, title: '准备A轮融资尽调清单', client: '科创未来科技', deadline: '明天 10:00', priority: 'medium', completed: false },
            { id: 3, title: '回复劳动仲裁申请书', client: '李某某', deadline: '周五', priority: 'high', completed: true }
        ];

        const cases = [
            { id: 101, title: '科创未来A轮融资专项法律服务', client: '科创未来', status: '进行中', progress: 65, type: '非诉', tags: ['金融', '融资'] },
            { id: 102, title: '张三诉李四民间借贷纠纷案', client: '张三', status: '等待开庭', progress: 30, type: '诉讼', tags: ['民事', '借贷'] },
            { id: 103, title: '南昌市政集团常年法律顾问', client: '南昌市政', status: '服务中', progress: 100, type: '常法', tags: ['顾问', '合规'] }
        ];

        const timeLogs = [
            { id: 1, task: '审核制度，并修改PPT', client: '南昌市政产集团', duration: 175, date: '2025-07-22', startTime: '09:00', endTime: '11:55' },
            { id: 2, task: '修订PPT，审核停管制度', client: '南昌市政产集团', duration: 240, date: '2025-07-22', startTime: '14:00', endTime: '18:00' },
            { id: 3, task: '准备PPT，重新跟进法律意见书', client: '南昌市政产集团', duration: 116, date: '2025-07-23', startTime: '09:00', endTime: '10:56' }
        ];

        const events = [
            { id: 1, title: '团队周会', description: "讨论'A轮融资'案", start: '2025-06-09T10:00:00', end: '2025-06-09T11:30:00', type: 'meeting' },
            { id: 2, title: '开庭：XX案', description: '第3法庭', start: '2025-06-11T11:00:00', end: '2025-06-11T11:30:00', type: 'court' },
            { id: 3, title: '客户访谈', description: '科创未来-李总', start: '2025-06-11T14:30:00', end: '2025-06-11T16:00:00', type: 'meeting' }
        ];

        localStorage.setItem('lawclick_tasks', JSON.stringify(tasks));
        localStorage.setItem('lawclick_cases', JSON.stringify(cases));
        localStorage.setItem('lawclick_timelogs', JSON.stringify(timeLogs));
        localStorage.setItem('lawclick_events', JSON.stringify(events));
    },

    tasks: {
        getAll: () => JSON.parse(localStorage.getItem('lawclick_tasks') || '[]'),
        add: (task) => {
            const tasks = DataService.tasks.getAll();
            task.id = Date.now();
            task.completed = false;
            tasks.unshift(task);
            localStorage.setItem('lawclick_tasks', JSON.stringify(tasks));
            // Dispatch event for cross-component updates if needed
            window.dispatchEvent(new CustomEvent('task-updated'));
            return task;
        },
        toggleComplete: (id) => {
            const tasks = DataService.tasks.getAll();
            const task = tasks.find(t => t.id == id);
            if (task) {
                task.completed = !task.completed;
                localStorage.setItem('lawclick_tasks', JSON.stringify(tasks));
                window.dispatchEvent(new CustomEvent('task-updated'));
            }
        },
        delete: (id) => {
            let tasks = DataService.tasks.getAll();
            tasks = tasks.filter(t => t.id != id);
            localStorage.setItem('lawclick_tasks', JSON.stringify(tasks));
            window.dispatchEvent(new CustomEvent('task-updated'));
        }
    },

    cases: {
        getAll: () => JSON.parse(localStorage.getItem('lawclick_cases') || '[]')
    },

    timeLogs: {
        getAll: () => JSON.parse(localStorage.getItem('lawclick_timelogs') || '[]'),
        getTotalDuration: () => {
            const logs = DataService.timeLogs.getAll();
            return logs.reduce((acc, log) => acc + log.duration, 0);
        }
    },

    events: {
        getAll: () => JSON.parse(localStorage.getItem('lawclick_events') || '[]')
    }
};

// Initialize on load
DataService.init();
