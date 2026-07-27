// Утилита для логирования (только в dev режиме)
// В продакшн режиме логи не выводятся

const IS_DEV = window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.search.includes('debug=true');

// Обертка для console.log
const logger = {
    log: (...args) => {
        if (IS_DEV) {
            console.log(...args);
        }
    },
    
    error: (...args) => {
        if (IS_DEV) {
            console.error(...args);
        }
    },
    
    warn: (...args) => {
        if (IS_DEV) {
            console.warn(...args);
        }
    },
    
    info: (...args) => {
        if (IS_DEV) {
            console.info(...args);
        }
    },
    
    debug: (...args) => {
        if (IS_DEV) {
            console.debug(...args);
        }
    }
};

// Экспортируем глобально
window.logger = logger;
