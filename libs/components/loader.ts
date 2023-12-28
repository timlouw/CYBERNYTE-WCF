import { Component, registerComponent } from '../services';

export default registerComponent(
  { name: 'ui-loader' },
  class extends Component {
    render = () => {
      const text = this.getAttribute('text') ?? '';
      const color = this.getAttribute('color') ?? 'primary';

      const card = document.createElement('div');
      card.innerHTML = html`
        <div class="loader">
          <svg class="spinner" width="38px" height="38px" stroke-width="4" viewBox="0 0 64 64">
            <circle style="stroke: var(--${color})" cx="32" cy="32" r="25" />
          </svg>
          <span class="primary-text f-16"> ${text} </span>
        </div>
      `;

      this.appendChild(card);
    };

    styles = () => {
      return html`
        <style>
          .loader {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            height: 38px;
          }

          .spinner {
            animation: rotate 2s linear infinite;
          }

          .spinner circle {
            fill: none;
            stroke-dasharray: 2, 155;
            stroke-dashoffset: 0;
            animation: dash 1.35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }

          @keyframes dash {
            0% {
              stroke-dasharray: 2, 155;
              stroke-dashoffset: 0;
            }
            50% {
              stroke-dasharray: 122, 20;
              stroke-dashoffset: -20;
            }
            100% {
              stroke-dasharray: 2, 155;
              stroke-dashoffset: -155;
            }
          }

          @keyframes rotate {
            100% {
              transform: rotate(360deg);
            }
          }
        </style>
      `;
    };
  },
);
