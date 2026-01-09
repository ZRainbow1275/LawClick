const fs = require('fs');
try {
    const content = fs.readFileSync('lint-results.json', 'utf8');
    const results = JSON.parse(content);

    const errorCounts = {};
    const fileCounts = [];

    let totalErrors = 0;
    let totalWarnings = 0;

    results.forEach(file => {
        if (file.messages.length > 0) {
            let fileErr = 0;
            let fileWarn = 0;
            file.messages.forEach(msg => {
                const ruleId = msg.ruleId || 'unknown';
                errorCounts[ruleId] = (errorCounts[ruleId] || 0) + 1;
                if (msg.severity === 2) {
                    fileErr++;
                    totalErrors++;
                } else {
                    fileWarn++;
                    totalWarnings++;
                }
            });
            fileCounts.push({ path: file.filePath, errors: fileErr, warnings: fileWarn, total: fileErr + fileWarn });
        }
    });

    fileCounts.sort((a, b) => b.total - a.total);

    console.log(`Total Files with issues: ${fileCounts.length}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Total Warnings: ${totalWarnings}`);

    console.log('\nTop 10 Rules:');
    Object.entries(errorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .forEach(([rule, count]) => console.log(`${rule}: ${count}`));

    console.log('\nTop 10 Files:');
    fileCounts.slice(0, 10).forEach(f => console.log(`${f.path} (E:${f.errors}, W:${f.warnings})`));

} catch (e) {
    console.error("Error parsing results:", e);
}
