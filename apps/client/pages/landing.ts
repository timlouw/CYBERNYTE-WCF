import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { MyElementComponent } from '../components/test.js';

export const AppComponent = registerComponent(
  { selector: 'ui-landing-page', type: 'page' },
  class extends Component {
    render = () => {
      console.log('rendering landing page');

      return html`
        HELLO ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
        ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })} ${MyElementComponent({ color: 'red' })}
      `;
    };

    static styles = css``;
  },
);
