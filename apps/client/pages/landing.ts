import { Component, registerComponent, setClick } from '@services';

export default registerComponent(
  { name: 'ui-landing-page', clickDetection: true },
  class extends Component {
    render = () => {
      setClick('findAPlaceClick', () => {
        // window.navigate('/search-properties');
      });

      setClick('listARentalClick', () => {
        // window.navigate('/create-property');
      });

      this.innerHTML = html`
        <div class="landing-container">
          <div class="mb-2">
            <div class="landing-image-container">
              <ui-image className="lavo-logo-landing-screen" name="lavo-logo"></ui-image>
            </div>
            <h1 class="primary-text fw-500 mt-1">Welcome to lavo!</h1>
            <h2 class="primary-text fw-400">Let's get you started</h2>
          </div>
          <div class="flex flex-col items-center">
            <ui-button width="280px" data-click="findAPlaceClick" shape="squared" aboveIcon="search" aboveIconColor="#1a1d56" theme="tertiary" text="Find a place"></ui-button>
            <p style="width: 240px" class="primary-text fw-400">An effortless path to finding your new home.</p>
            <br />
            <ui-button width="280px" data-click="listARentalClick" shape="squared" aboveIcon="home" aboveIconColor="#1a1d56" theme="tertiary" text="List a rental"></ui-button>
            <p style="width: 240px" class="primary-text fw-400">Your one-stop solution for hassle-free rental listings!</p>
          </div>
        </div>
      `;
    };

    styles = () => {
      return html`
        <style>
          .landing-container {
            display: flex;
            justify-content: space-evenly;
            flex-direction: column;
            text-align: center;
            min-height: 100%;
          }

          .TAndCs {
            width: 190px;
          }

          .landing-image-container {
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
          }

          .lavo-logo-landing-screen {
            width: 80px;
          }
        </style>
      `;
    };
  },
);
