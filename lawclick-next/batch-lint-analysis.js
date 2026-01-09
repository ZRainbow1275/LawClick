// 批量分析剩余问题文件
const fs = require('fs');
try {
    const content = fs.readFileSync('lint-results.json', 'utf8');
    const results = JSON.parse(content);

    // 按规则分类收集
    const byRule = {};

    results.forEach(file => {
        file.messages.forEach(msg => {
            const rule = msg.ruleId || 'unknown';
            if (!byRule[rule]) byRule[rule] = [];
            byRule[rule].push({
                file: file.filePath.replace(/\\\\/g, '/').replace('D:/Desktop/LawClick_NEW/lawclick-next/', ''),
                line: msg.line,
                msg: msg.message.substring(0, 60)
            });
        });
    });

    // 输出按规则分组的问题
    ['@typescript-eslint/no-unused-vars', '@typescript-eslint/no-explicit-any', 'react/no-unescaped-entities'].forEach(rule => {
        if (byRule[rule]) {
            console.log(`\n=== ${rule} (${byRule[rule].length}) ===`);
            // 按文件分组
            const byFile = {};
            byRule[rule].forEach(item => {
                if (!byFile[item.file]) byFile[item.file] = [];
                byFile[item.file].push(item);
            });
            // 输出前10个文件
            Object.entries(byFile).slice(0, 10).forEach(([file, items]) => {
                console.log(`${file}: ${items.length} issues`);
                items.slice(0, 2).forEach(i => console.log(`  L${i.line}: ${i.msg}`));
            });
        }
    });

} catch (e) {
    console.error("Error:", e);
}
