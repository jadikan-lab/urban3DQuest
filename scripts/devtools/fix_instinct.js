const fs = require('fs');
const path = 'index.html';
let content = fs.readFileSync(path, 'utf8');

// The grep output showed: label: 'L'INSTINCT'
// In JS, that would be label: 'L\'INSTINCT' or it might even be literal label: 'L'INSTINCT' 
// if the previous dev didn't escape it and used double quotes for the string containing it, 
// or if it was just broken.
// Let's try to match the exact substring "label: 'L'INSTINCT'" vs "label: 'L\'INSTINCT'"

const oldStr = "label: 'L'INSTINCT'";
const newStr = "label: 'L\\'INSTINCT'";

if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    fs.writeFileSync(path, content);
    console.log("Fixed label: 'L'INSTINCT'");
} else {
    console.log("Could not find label: 'L'INSTINCT' with that exact quoting.");
    // Attempt check for already escaped version just in case
    if (content.includes("label: 'L\\'INSTINCT'")) {
        console.log("Already matches label: 'L\\'INSTINCT'");
    }
}
