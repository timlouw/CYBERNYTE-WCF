import { Component, registerComponent, setClick, setIfBinding } from "@services";

interface MenuItem {
  label: string;
  icon: string;
  link: string;
  externalLink?: boolean;
}

export default registerComponent(
  { name: 'ui-header', clickDetection: true, changeDetection: true },
  class extends Component {
    #showOpenMenu = setIfBinding('showOpenMenu', true);
    #showCloseMenu = setIfBinding('showCloseMenu', false);
    #menuItems: MenuItem[] = [
      { label: 'Find a home', icon: 'home', link: '/search-properties' },
      { label: 'Favourites', icon: 'favourite', link: '/favourites' },
      { label: 'My Applications', icon: 'person', link: '/my-applications' },
      { label: 'My Properties', icon: 'my-homes', link: '/my-properties' },
      { label: 'Incoming Applications', icon: 'group', link: '/incoming-applications' },
      { label: 'Profile', icon: 'settings', link: '/profile' },
      { label: 'Logout', icon: 'logout', link: '/logout' },
    ];

    render = () => {
      const title = this.getAttribute('title') ?? '';

      const row = document.createElement('div');
      row.innerHTML = this.getHeaderRowHTML(row, title);
      this.appendChild(row);
    };

    styles = () => {
      return html`
        <style>
          ui-header {
            display: block;
            height: var(--ui-header-height);
          }

          .header-controls-row {
            width: 100%;
            height: var(--ui-header-height);
            background-color: var(--secondary);
            color: var(--white);
            font-size: 12px;
            z-index: 999;
            position: fixed;
            left: 0;
            transition: height 0.3s ease-in-out;
            overflow: hidden;
          }

          .header-controls-row.expanded {
            height: 100% !important;
            border-bottom-left-radius: 0px !important;
            border-bottom-right-radius: 0px !important;
          }

          .header-inner-container {
            display: flex;
            height: var(--ui-header-height);
            align-items: center;
            margin: 0px 12px;
          }

          .header-inner-container-left {
            display: flex;
            align-items: center;
          }

          .page-title-container {
            font-size: 15px;
            margin-left: 18px;
          }

          .menu-items-container {
            padding: 40px 20px;
          }

          .menu-item {
            border-bottom: 1px solid var(--white);
            display: flex;
            align-items: center;
            height: 40px;
            font-size: 12px;
          }

          .menu-icon-container {
            height: 22px;
            margin: 0px 12px;
          }

          .menu-button {
            margin-left: 5px;
            height: 26px;
            width: 26px;
            border-radius: 26px;
            background-color: var(--secondary);
            cursor: pointer;
          }

          .menu-button:hover {
            opacity: 0.9;
            outline: 0;
          }

          .menu-button:focus {
            outline: 0;
          }

          .schedule-header-icon {
            height: 14px;
            margin-right: 6px;
          }
        </style>
      `;
    };

    getHeaderRowHTML(rowElement: HTMLElement, title: string) {
      return html`
        <div class="header-controls-row">
          <div class="header-inner-container">
            <span class="header-inner-container-left"> ${this.getMenuButtonHTML(rowElement)} </span>
            <span class="page-title-container fw-600"> ${title} </span>
          </div>
          <div class="menu-items-container"> ${this.getMenuItemsHTML(rowElement)} </div>
        </div>
      `;
    }

    getMenuButtonHTML(rowElement: HTMLElement) {
      setClick('toggleMenuClick', () => this.toggleMenu(rowElement));

      return html`
        <span class="menu-button ripple" data-click="toggleMenuClick">
          <ui-image data-if="showOpenMenu" iconColor="#FFFFFF" name="menu"></ui-image>
          <ui-image data-if="showCloseMenu" iconColor="#FFFFFF" name="close"></ui-image>
        </span>
      `;
    }

    toggleMenu(rowElement: HTMLElement, menuLink?: string, externalLink = false) {
      rowElement?.querySelector('.header-controls-row')?.classList?.toggle('expanded');

      setTimeout(
        () => {
          this.#showOpenMenu.next(!this.#showOpenMenu.getValue());
          this.#showCloseMenu.next(!this.#showCloseMenu.getValue());

          if (menuLink) {
            if (externalLink) {
              window.open(menuLink);
            } else {
              window.navigate(menuLink as any);
            }
          }
        },
        menuLink ? 0 : 200,
      );
    }

    getMenuItemsHTML(rowElement: HTMLElement) {
      return `
            ${this.#menuItems.map((item) => this.getMenuItemHTML(rowElement, item)).join('')}
        `;
    }

    getMenuItemHTML(rowElement: HTMLElement, item: MenuItem) {
      const clickKey = item.icon + 'menuItemClick';
      setClick(clickKey, () => this.toggleMenu(rowElement, item.link, item.externalLink));

      return html`
        <div class="menu-item ripple" data-click="${clickKey}">
          <span class="menu-icon-container">
            <ui-image fullHeight="true" name="${item.icon}" iconColor="#FFFFFF"></ui-image>
          </span>
          <span> ${item.label} </span>
        </div>
      `;
    }
  },
);
