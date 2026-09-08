'use strict';
// Stable lesson IDs and a read-only migration of the previous numeric progress.
window.LessonState = class LessonState {
  constructor(prefix, sections) {
    this.sections = sections;
    this.key = `${prefix}-done-v2`;
    const valid = new Set(sections.map(s => s.dataset.lessonId));
    this.done = new Set();
    try {
      const saved = localStorage.getItem(this.key);
      const values = JSON.parse(saved ?? localStorage.getItem(`${prefix}-done-v1`) ?? '[]');
      if (Array.isArray(values)) for (const value of values) {
        const id = saved !== null ? value : sections.find(s => Number.isInteger(value) && s.dataset.legacyIndex === String(value))?.dataset.lessonId;
        if (valid.has(id)) this.done.add(id);
      }
    } catch { /* Reading remains available if storage is blocked or malformed. */ }
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify([...this.done])); return true; }
    catch { return false; }
  }
  index(hash) {
    const key = hash.replace(/^#/, '');
    const stable = this.sections.findIndex(s => s.dataset.lessonId === key);
    if (stable >= 0) return stable;
    const legacy = /^ch(\d+)$/.exec(key);
    const old = legacy ? this.sections.findIndex(s => s.dataset.legacyIndex === String(Number(legacy[1]))) : -1;
    return old >= 0 ? old : 0;
  }
};
