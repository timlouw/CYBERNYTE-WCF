import { Component, registerComponent, setClick } from '@services';

export default registerComponent(
  { name: 'ui-404-page', clickDetection: true, fullHeight: true },
  class extends Component {
    render = () => {
      setClick('goHome', () => {
        window.navigate('/');
      });

      return html`
        <div class="testContainer" style="text-align: center">
          <h1>404</h1>
          <h1>Not Found</h1>
          <p>
            The page you are looking for cannot be found. <br /><br />
            We might be busy with updates can you please wait a few hours and check again?
          </p>

          <br />
          <br />

          <ui-button data-click="goHome" theme="primary" text="GO TO HOME"></ui-button>
        </div>
      `;
    };

    styles = () => {
      return html` <style></style> `;
    };
  },
);
