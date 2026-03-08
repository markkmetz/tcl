#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, 'fixtures-large-generated');
const TOTAL_FILES = 1000;
const NAMESPACED_FILES = 500;
const MIN_PROCS = 20;
const MAX_PROCS = 50;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(133742);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const verbs = ['warp', 'mangle', 'zap', 'fold', 'twist', 'nudge', 'glitch', 'drift', 'mix', 'bloop'];
const nouns = ['widget', 'buffer', 'signal', 'matrix', 'crumb', 'pulse', 'token', 'channel', 'packet', 'blob'];

function nonsenseWord() {
  return `${pick(verbs)}_${pick(nouns)}_${randInt(1, 9999)}`;
}

function makeProc(procName) {
  const a = nonsenseWord();
  const b = nonsenseWord();
  const c = nonsenseWord();

  return [
    `proc ${procName} {a {b 2} args} {`,
    `\tset ${a} [expr {($a + $b) * ${randInt(2, 9)}}]`,
    `\tset ${b} [list ${randInt(1, 999)} ${randInt(1, 999)} $args]`,
    `\tif {${randInt(0, 1)} && [llength $${b}] > 0} {`,
    `\t\tset ${c} "${nonsenseWord()}_[string length $${b}]"`,
    `\t} else {`,
    `\t\tset ${c} "${nonsenseWord()}_fallback"`,
    `\t}`,
    `\treturn [list $${a} $${b} $${c}]`,
    `}`,
    ``
  ].join('\n');
}

function makeNamespacedFile(index) {
  const ns = `::gen_ns_${index}`;
  const procCount = randInt(MIN_PROCS, MAX_PROCS);
  const lines = [
    `# Auto-generated Tcl fixture file ${index} (namespaced)`,
    `namespace eval ${ns} {`,
    ``
  ];

  for (let i = 0; i < procCount; i++) {
    const procName = `${ns}::${nonsenseWord()}_${i}`;
    const procBody = makeProc(procName)
      .split('\n')
      .map((line) => (line ? `  ${line}` : line))
      .join('\n');
    lines.push(procBody);
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function makeGlobalFile(index) {
  const procCount = randInt(MIN_PROCS, MAX_PROCS);
  const lines = [`# Auto-generated Tcl fixture file ${index} (global procs)`, ``];

  for (let i = 0; i < procCount; i++) {
    const procName = `${nonsenseWord()}_${index}_${i}`;
    lines.push(makeProc(procName));
  }

  return lines.join('\n');
}

function ensureCleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  ensureCleanDir(OUTPUT_DIR);

  for (let i = 0; i < TOTAL_FILES; i++) {
    const isNamespaced = i < NAMESPACED_FILES;
    const content = isNamespaced ? makeNamespacedFile(i) : makeGlobalFile(i);
    const fileName = isNamespaced
      ? `generated_namespaced_${String(i).padStart(4, '0')}.tcl`
      : `generated_global_${String(i).padStart(4, '0')}.tcl`;

    fs.writeFileSync(path.join(OUTPUT_DIR, fileName), content, 'utf8');
  }

  console.log(`Generated ${TOTAL_FILES} Tcl files in ${OUTPUT_DIR}`);
  console.log(`- Namespaced files: ${NAMESPACED_FILES}`);
  console.log(`- Global files: ${TOTAL_FILES - NAMESPACED_FILES}`);
  console.log(`- Proc count per file: ${MIN_PROCS}-${MAX_PROCS}`);
}

main();
