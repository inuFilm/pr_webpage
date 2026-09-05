/* events.js — シンプルなイベントバス
 * 効果音・読み上げ・演出などは、ここで発火するイベントを購読して実装する。
 *
 * 主なイベント:
 *   'stroke:ok'      {kanji, index, total, category, ability}
 *   'stroke:ng'      {kanji, index, total, reasons}
 *   'kanji:complete' {kanji, reading, spell, category, ability, perfect}
 *   'magic:cast'     {kanji, category, ability}
 *   'enemy:hit'      {damage, enemy}
 *   'enemy:defeat'   {enemy}
 *   'player:hit'     {damage}
 *   'kanji:new'      {kanji}
 *   'stage:clear'    {stageId}
 *   'ui:click'       {}
 *   'combo:available'{kanji:[...], combo}
 */
(function (root) {
  'use strict';
  var handlers = {};
  var Events = {
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); return function () { Events.off(name, fn); }; },
    off: function (name, fn) { var l = handlers[name]; if (!l) return; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit: function (name, payload) {
      var l = handlers[name]; if (l) l.slice().forEach(function (fn) { try { fn(payload); } catch (e) { console.error('[Events]', name, e); } });
      var a = handlers['*']; if (a) a.slice().forEach(function (fn) { try { fn(name, payload); } catch (e) { console.error('[Events*]', e); } });
    }
  };
  root.Events = Events;
})(window);
