declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        preload?: string;
        allowpopups?: string;
        nodeintegration?: string;
      },
      HTMLElement
    >;
  }
}
