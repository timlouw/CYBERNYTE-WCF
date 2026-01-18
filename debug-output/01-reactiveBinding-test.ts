import {
  Component,
  registerComponent,
  __bindStyle,
  __bindAttr,
  __bindText,
  __bindIf,
  __bindIfExpr,
  __bindRepeat,
  __bindNestedRepeat,
  __findEl,
  __setupEventDelegation,
} from '../../../framework/runtime/dom/index.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    static template = (() => {
      const t = document.createElement('template');
      t.innerHTML = `<div id="b14" class="click-section"> <p>Click count: <span id="b15">0</span></p> <button id="b18" data-evt-click="e0" >Option 1</button> <button id="b19" data-evt-click="e1" >Option 2</button> <button id="b20" data-evt-click="e2:stop" >Option 3</button> </div> <div id="b16" class="box" style="background-color: "></div> <div id="b17" class="box" style="background-color: "></div> <template id="b0"></template> <template id="b2"></template> <div class="status"> <template id="b3"></template><div id="b4">Ready!</div> </div> <template id="b5"></template>`;
      return t;
    })();

    initializeBindings = () => {
      const r = this.shadowRoot;
      const b14 = r.getElementById('b14');
      const b15 = r.getElementById('b15');
      const b16 = r.getElementById('b16');
      const b17 = r.getElementById('b17');
      b14.setAttribute('class', this._class());
      b15.textContent = this._clickCount();
      b16.style.backgroundColor = this._color();
      b17.style.backgroundColor = this._color();
      this._class.subscribe((v) => {
        b14.setAttribute('class', v);
      }, true);
      this._clickCount.subscribe((v) => {
        b15.textContent = v;
      }, true);
      this._color.subscribe((v) => {
        b16.style.backgroundColor = v;
        b17.style.backgroundColor = v;
      }, true);
      __bindIf(r, this._loading, 'b0', `<div id="b0" class="box" style="background-color: "> <template id="b1"></template> </div>`, () => {
        const b0 = r.getElementById('b0');
        b0.style.backgroundColor = this._color();
        return [
          this._color.subscribe((v) => {
            b0.style.backgroundColor = v;
          }, true),
          __bindIfExpr(
            r,
            [this._loading2],
            () => !this._loading2(),
            'b1',
            `<div id="b1">loading 2</div>`,
            () => [],
          ),
        ];
      });
      __bindIf(r, this._loading, 'b2', `<div id="b2" class="box" style="background-color: "></div>`, () => {
        const b2 = r.getElementById('b2');
        b2.style.backgroundColor = this._color();
        return [
          this._color.subscribe((v) => {
            b2.style.backgroundColor = v;
          }, true),
        ];
      });
      __bindIfExpr(
        r,
        [this._loading],
        () => this._loading(),
        'b3',
        `<div id="b3">Loading...</div>`,
        () => [],
      );
      __bindIfExpr(
        r,
        [this._loading],
        () => !this._loading(),
        'b4',
        `<div id="b4">Ready!</div>`,
        () => [],
      );
      __bindRepeat(
        r,
        this._countries,
        'b5',
        (country$, _idx) =>
          `<div id="b9" class="${this._class()}"><span id="i10">${country$()}</span></div> <span id="i11">${country$()}</span> <span id="i12">${country$()}</span> <div class="box2"><span id="i13">${country$()}</span></div> <template id="b6"></template>`,
        (els, country$, _idx) => {
          const $ = (id) => __findEl(els, id);
          return [
            country$.subscribe(() => {
              let e;
              const v = country$();
              e = $('i10');
              if (e) e.textContent = v;
              e = $('i11');
              if (e) e.textContent = v;
              e = $('i12');
              if (e) e.textContent = v;
              e = $('i13');
              if (e) e.textContent = v;
            }, true),
            this._class.subscribe((v) => {
              let e;
              e = $('b9');
              if (e) e.setAttribute('class', v);
            }, true),
            __bindNestedRepeat(
              els,
              country$,
              () => this._cities(),
              'b6',
              (city$, _idx2) => `<template id="b7"></template>`,
              (nel, city$, _idx2) => {
                const $n = (id) => __findEl(nel, id);
                return [
                  __bindIf({ getElementById: $n }, this._loading, 'b7', `<div id="b7"><span id="i8">${city$()}</span> inner loading</div>`, () => [
                    city$.subscribe(() => {
                      const el = $n('i8');
                      if (el) el.textContent = city$();
                    }, true),
                  ]),
                ];
              },
            ),
          ];
        },
      );
      __setupEventDelegation(r, {
        click: { e0: (e) => this._handleClick.call(this, e), e1: (e: Event) => this._handleClickWithEvent(e), e2: (e) => this._handleClick.call(this, e) },
      });
    };
    private _color = signal(this.getAttribute('color'));
    private _loading = signal(false);
    private _loading2 = signal(true);
    private _countries = signal(['USA', 'Canada', 'Mexico', 'Germany', 'France', 'Italy', 'Spain', 'Japan', 'China', 'India']);
    private _cities = signal(['New York', 'Toronto', 'Mexico City']);
    private _clickCount = signal(0);
    private _class = signal('click-section');

    render = () => {
      setTimeout(() => {
        this._update();
      }, 500);

      // Example 1: Remove item at index (splice)
      setTimeout(() => {
        this._countries(this._countries().toSpliced(2, 1));
      }, 1000);

      // Example 2: Add item at end
      setTimeout(() => {
        this._countries([...this._countries(), 'Brazil']);
      }, 1500);

      // Example 3: Update item at specific index
      setTimeout(() => {
        const arr = [...this._countries()];
        arr[0] = 'United States';
        this._countries(arr);
      }, 2000);

      // Example 4: Move item (swap positions)
      setTimeout(() => {
        const arr = [...this._countries()];
        [arr[0], arr[1]] = [arr[1], arr[0]];
        this._countries(arr);
        this._class('click-section updated');
      }, 2500);

      return ``;
    };

    private _handleClick() {
      this._clickCount(this._clickCount() + 1);
      console.log('Option 1: Simple click');
    }

    private _handleClickWithEvent(event: Event) {
      this._clickCount(this._clickCount() + 1);
      console.log('Option 4: Event target:', (event.target as HTMLElement).textContent);
    }

    private _update = () => {
      this._color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      this._loading(!this._loading());
      this._loading2(!this._loading2());
    };

    static styles = `
      .box {
        width: 100%;
        height: 20px;
        border-radius: 5px;
        border: 1px solid black;
      }

      .box2 {
        width: 100%;
        height: 20px;
        border-radius: 5px;
        border: 2px solid green;
      }

      .click-section {
        border: 1px solid #ccc;
        border-radius: 5px;
      }

      .click-section.updated {
        background-color: lightgreen;
      }

      .click-section button {
        margin: 5px;
        padding: 8px 16px;
        cursor: pointer;
      }
    `;
  },
);
