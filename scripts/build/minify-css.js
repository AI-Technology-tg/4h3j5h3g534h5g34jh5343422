// Скрипт для минификации CSS файлов
const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');

const stylesDir = path.join(__dirname, '../../styles');
const distDir = path.join(__dirname, '../../dist/styles');

// Создаем директорию dist если её нет
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Список файлов для минификации
const filesToMinify = [
    'main.css',
    'sidebar-layout.css',
    'loading.css',
    'register-flow.css',
    'catalog.css',
    'anime-view.css',
    'profile.css',
    'live2d-widget.css'
];

function minifyFile(filePath, outputPath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const result = new CleanCSS({
            level: 2,
            format: false
        }).minify(code);
        
        if (result.errors && result.errors.length > 0) {
            console.error(`✗ Ошибки в ${path.basename(filePath)}:`, result.errors);
            return false;
        }
        
        fs.writeFileSync(outputPath, result.styles);
        const originalSize = fs.statSync(filePath).size;
        const minifiedSize = Buffer.byteLength(result.styles, 'utf8');
        const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
        
        console.log(`✓ ${path.basename(filePath)}: ${(originalSize / 1024).toFixed(2)}KB → ${(minifiedSize / 1024).toFixed(2)}KB (${savings}% меньше)`);
        return true;
    } catch (error) {
        console.error(`✗ Ошибка минификации ${filePath}:`, error.message);
        return false;
    }
}

function minifyAll() {
    console.log('Начинаем минификацию CSS файлов...\n');
    
    let processed = 0;
    let errors = 0;
    
    for (const file of filesToMinify) {
        const filePath = path.join(stylesDir, file);
        const outputPath = path.join(distDir, file);
        
        if (fs.existsSync(filePath)) {
            if (minifyFile(filePath, outputPath)) {
                processed++;
            } else {
                errors++;
            }
        } else {
            console.log(`⚠ Файл не найден: ${file}`);
            errors++;
        }
    }
    
    console.log(`\nГотово! Обработано: ${processed}, ошибок: ${errors}`);
}

minifyAll();
