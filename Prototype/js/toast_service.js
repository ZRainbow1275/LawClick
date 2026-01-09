/**
 * LawClick Toast Service
 * Provides global notification feedback.
 */

const ToastService = {
    init: function () {
        // Create container if not exists
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none';
            document.body.appendChild(container);
        }
    },

    show: function (message, type = 'success') {
        this.init();
        const container = document.getElementById('toast-container');

        const toast = document.createElement('div');
        toast.className = `toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-md border transition-all duration-300 transform`;

        // Style based on type
        if (type === 'success') {
            toast.classList.add('bg-white/90', 'border-green-100', 'text-green-800');
            toast.innerHTML = `<i class="fas fa-check-circle text-green-500 text-lg"></i><span class="font-medium text-sm">${message}</span>`;
        } else if (type === 'error') {
            toast.classList.add('bg-white/90', 'border-red-100', 'text-red-800');
            toast.innerHTML = `<i class="fas fa-exclamation-circle text-red-500 text-lg"></i><span class="font-medium text-sm">${message}</span>`;
        } else {
            toast.classList.add('bg-white/90', 'border-blue-100', 'text-blue-800');
            toast.innerHTML = `<i class="fas fa-info-circle text-blue-500 text-lg"></i><span class="font-medium text-sm">${message}</span>`;
        }

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-[-20px]', 'opacity-0');
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
