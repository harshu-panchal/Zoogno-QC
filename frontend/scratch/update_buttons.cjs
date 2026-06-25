const fs = require('fs');
const path = require('path');

const directoryPath = 'c:/Users/victus/Desktop/zoognu/frontend/src/modules/admin/pages';

const primaryActionWords = [
    'DOWNLOAD', 'EXPORT', 'CREATE', 'ADD', 'SAVE', 'SUBMIT', 'UPDATE',
    'GENERATE', 'APPROVE', 'REJECT', 'ASSIGN', 'PROCEED', 'CONFIRM', 'VERIFY', 'APPLY', 'SEARCH', 'FILTER', 'PAY', 'SETTLE', 'ISSUE'
];

// This regex matches <button> or <Button> tags and their contents.
// It uses non-greedy matching to capture the className and the button text.
// Note: This is a simple regex and might not catch all edge cases, but should cover most standard buttons.
const buttonRegex = /<(button|Button)([^>]*?)className=(["'{].*?["'}])([^>]*?)>([\s\S]*?)<\/\1>/gi;

const newClassName = '"bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm"';

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    content = content.replace(buttonRegex, (match, tag, beforeClass, oldClass, afterClass, innerHtml) => {
        // Check if the button contains any of the primary action words (case insensitive)
        const innerTextUpper = innerHtml.toUpperCase();
        
        // Also check if it's an icon-only button (usually small, padding like p-1, p-2)
        // Let's avoid touching obvious icon-only buttons if possible, though checking text should mostly prevent it.
        const isIconOnly = oldClass.includes('w-8') || oldClass.includes('h-8') || oldClass.includes('p-2') && !innerHtml.match(/[a-zA-Z]{3,}/);

        const hasPrimaryAction = primaryActionWords.some(word => innerTextUpper.includes(word));
        
        // If it looks like a primary action button and is not just a tiny icon button
        if (hasPrimaryAction && !isIconOnly) {
            modified = true;
            console.log(`Replacing button in ${path.basename(filePath)}: ${innerHtml.trim().substring(0, 30)}...`);
            // We might need to keep disabled states if they exist in class, but we can just override.
            // Some classes might be dynamic: className={cn(...)}. Let's just override with a string for simplicity,
            // or if it was dynamic, we just turn it into a static string if it wasn't complex.
            // To be safer, let's inject our classes.
            return `<${tag}${beforeClass}className=${newClassName}${afterClass}>${innerHtml}</${tag}>`;
        }

        return match;
    });

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.jsx')) {
            processFile(fullPath);
        }
    }
}

walkDir(directoryPath);
console.log("Done updating buttons.");
