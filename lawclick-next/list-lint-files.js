const fs = require('fs');
try {
    const content = fs.readFileSync('lint-results.json', 'utf8');
    const results = JSON.parse(content);

    const files = [];
    results.forEach(file => {
        if (file.messages.length > 0) {
            const errs = file.messages.filter(m => m.severity === 2).length;
            const warns = file.messages.filter(m => m.severity === 1).length;
            files.push({
                path: file.filePath.replace(/\\\\/g, '/').replace('D:/Desktop/LawClick_NEW/lawclick-next/', ''),
                errors: errs,
                warnings: warns,
                total: errs + warns,
                messages: file.messages.slice(0, 3).map(m => `L${m.line}: ${m.ruleId}`)
            });
        }
    });

    files.sort((a, b) => b.total - a.total);

    files.forEach(f => {
        console.log(`${f.path} (E:${f.errors}, W:${f.warnings})`);
        f.messages.forEach(m => console.log(`  ${m}`));
    });

} catch (e) {
    console.error("Error:", e);
}
