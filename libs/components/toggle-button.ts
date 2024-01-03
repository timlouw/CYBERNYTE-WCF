import { DOM_DATA_OUTPUT_ATTRIBUTE_NAME, Component, registerComponent, getDataOutputBinding, setClick } from '@services';

export default registerComponent(
  { name: 'ui-toggle-button', clickDetection: true },
  class extends Component {
    #toggled = false;

    render = () => {
      this.#toggled = this.getAttribute('toggled') === 'true' ? true : false;
      const containerTheme = 'ui-toggle-button-' + (this.getAttribute('theme') ? this.getAttribute('theme') : 'white');
      const circleTheme = 'ui-toggle-circle-' + (this.getAttribute('theme') ? this.getAttribute('theme') : 'white');
      const dataOutputKey = this.getAttribute(DOM_DATA_OUTPUT_ATTRIBUTE_NAME) ?? '';
      const dataOutput = getDataOutputBinding(dataOutputKey);

      const toggle = document.createElement('div');
      toggle.innerHTML = html` <div class="ui-toggle-circle ${circleTheme}"> ${this.getToggleCircleIcon()} </div> `;
      const clickKey = dataOutputKey + 'toggleClick';
      toggle.setAttribute('data-click', clickKey);
      toggle.className = `ui-toggle-container ${containerTheme}`;

      setClick(clickKey, () => {
        const toggleCircle = toggle.querySelector('.ui-toggle-circle') as HTMLElement;
        this.#toggled = !this.#toggled;

        this.updateToggleCircle(toggleCircle);
        dataOutput.next(this.#toggled);
      });

      this.appendChild(toggle);
    };

    styles = () => {
      return html`
        <style>
          .ui-toggle-container {
            height: 26px;
            width: 44px;
            border-radius: 26px;
            border: 2px solid var(--primary);
            cursor: pointer;
            background-color: transparent;
            display: flex;
            align-items: center;
            position: relative;
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0) !important;
          }

          .ui-toggle-circle {
            height: 20px;
            width: 20px;
            font-size: 20px;
            line-height: 20px;
            border-radius: 26px;
            text-align: center;
            position: absolute;
            left: 4px;
            transition: left 0.3s ease;
            user-select: none;
          }

          .ui-toggle-button-icon {
            height: 16px;
          }

          .ui-toggle-circle.active {
            left: calc(100% - 20px - 4px);
            font-size: 14px;
          }

          .ui-toggle-button:hover {
            opacity: 0.8;
            outline: 0;
          }

          .ui-toggle-button:focus {
            outline: 0;
          }

          .ui-toggle-button-white {
            border-color: var(--white);
          }

          .ui-toggle-button-primary {
            border-color: var(--primary);
          }

          .ui-toggle-circle-white {
            background-color: var(--white);
            color: var(--secondary);
          }

          .ui-toggle-circle-primary {
            background-color: var(--primary);
            color: var(--white);
          }
        </style>
      `;
    };

    getToggleCircleIcon() {
      const imageName = this.#toggled ? 'check' : 'close';
      return html`<ui-image className="ui-toggle-button-icon" name="${imageName}" iconColor="#FFFFFF"></ui-image>`;
    }

    updateToggleCircle(toggleCircle: HTMLElement) {
      toggleCircle.classList.toggle('active');
      toggleCircle.innerHTML = this.getToggleCircleIcon();
    }
  },
);
