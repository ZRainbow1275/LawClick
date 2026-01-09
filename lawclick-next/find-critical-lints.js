const fs = require('fs');
try {
    const content = fs.readFileSync('lint-results.json', 'utf8');
    const results = JSON.parse(content);

    const targetRules = [
        '@typescript-eslint/no-unused-vars'
    ];

    results.forEach(file => {
        const hits = file.messages.filter(m => targetRules.includes(m.ruleId));
        if (hits.length > 0) {
            console.log(`\nFile: ${file.filePath}`);
            hits.slice(0, 5).forEach(m => console.log(`  Line ${m.line}: ${m.message}`));
            if (hits.length > 5) console.log(`  ... and ${hits.length - 5} more`);
        }
    });

} catch (e) {
    console.error("Error parsing results:", e);
}
