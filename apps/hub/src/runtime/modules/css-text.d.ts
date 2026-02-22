/** CSS files imported with `{ type: 'text' }` are embedded as strings at bundle time. */
declare module '*.css' {
  const content: string;
  export default content;
}
