import { Component, registerComponent } from '@services';

export default registerComponent(
  { name: 'ui-chip' },
  class extends Component {
    render = () => {
      const theme = 'ui-chip-' + (this.getAttribute('theme') ?? 'secondary');
      const text = this.getAttribute('text') ?? 'No chip text';
      const width = this.getAttribute('width') ?? 'auto';

      const chip = document.createElement('chip');
      chip.innerHTML = text;
      chip.className = `ui-chip ripple ${theme}`;
      chip.style.width = width;

      this.appendChild(chip);
    };

    styles = () => {
      return html`
        <style>
          ui-chip {
            height: 25px;
          }

          .ui-chip {
            border: 0;
            border-radius: 20px;
            padding: 6px 10px;
            font-weight: 400;
            font-size: 12px;
            cursor: pointer;
            height: 25px;
            display: inline-block;
            box-sizing: border-box;
            text-align: center;
          }

          .ui-chip:hover {
            opacity: 0.9;
          }

          .ui-chip:focus {
            outline: 0 !important;
            box-shadow: none;
          }

          .ui-chip-primary {
            color: var(--white);
            background-color: var(--primary);
          }

          .ui-chip-secondary {
            color: var(--primary);
            background-color: var(--white);
            border: 1px solid var(--primary);
          }

          .ui-chip-tertiary {
            color: var(--white);
            background-color: var(--grey);
          }
        </style>
      `;
    };
  },
);
