// Скрипт для минификации JavaScript файлов
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const scriptsDir = path.join(__dirname, '..');
const distDir = path.join(__dirname, '../../dist/scripts');

// Создаем директорию dist если её нет
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Список файлов для минификации (исключаем build и node_modules)
const filesToMinify = [
    'logger.js',
    'config.js',
    'kodik-api.js',
    'kodik-catalog-resolve.js',
    'kodik-change-domains.js',
    'live2d-widget-init.js',
    'network-utils.js',
    'form-validation.js',
    'supabase-config.js',
    'utils.js',
    'api.js',
    'auth.js',
    'mature-content.js',
    'support-minko-chat.js',
    'data.js',
    'main.js',
    'navigation.js',
    'utils-notifications.js',
    'notification-preferences.js',
    'notifications.js',
    'register.js',
    'email-confirm.js',
    'password-reset.js',
    'loading.js',
    'home.js',
    'catalog.js',
    'minko-ai.js',
    'profile.js',
    'favorites.js',
    'favorites-manga.js',
    'history.js',
    'friends.js',
    'anime-view.js',
    'anime-stats.js',
    'manga-view.js',
    'manga-reader.js',
    'manga-catalog.js',
    'manga-data.js',
    'manga-stats.js',
    'ai-subscription.js',
    'watch-together.js',
    'watch-together-voice.js',
    'watch-history.js',
    'achievements.js',
    'anilist-api.js',
    'oauth-auth.js',
    'settings-modal.js',
    'apply-navigation.js',
    'loading-phrases.js'
];

async function minifyFile(filePath, outputPath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const result = await minify(code, {
            compress: {
                drop_console: true, // Удаляем console.log в продакшн
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info', 'console.debug']
            },
            format: {
                comments: false
            }
        });
        
        fs.writeFileSync(outputPath, result.code);
        const originalSize = fs.statSync(filePath).size;
        const minifiedSize = Buffer.byteLength(result.code, 'utf8');
        const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
        
        console.log(`✓ ${path.basename(filePath)}: ${(originalSize / 1024).toFixed(2)}KB → ${(minifiedSize / 1024).toFixed(2)}KB (${savings}% меньше)`);
    } catch (error) {
        console.error(`✗ Ошибка минификации ${filePath}:`, error.message);
    }
}

async function minifyAll() {
    console.log('Начинаем минификацию JavaScript файлов...\n');
    
    let processed = 0;
    let errors = 0;
    
    for (const file of filesToMinify) {
        const filePath = path.join(scriptsDir, file);
        const outputPath = path.join(distDir, file);
        
        if (fs.existsSync(filePath)) {
            await minifyFile(filePath, outputPath);
            processed++;
        } else {
            console.log(`⚠ Файл не найден: ${file}`);
            errors++;
        }
    }
    
    console.log(`\nГотово! Обработано: ${processed}, ошибок: ${errors}`);
}

minifyAll().catch(console.error);
