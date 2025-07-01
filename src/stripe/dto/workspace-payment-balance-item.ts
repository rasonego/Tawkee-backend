export interface WorkspacePaymentBalanceItem {
  /**
   * ISO date string in 'YYYY-MM-DD' format
   */
  date: string;

  /**
   * Cumulative amount (in cents) spent on subscription plan by this date
   */
  planAmount: number;

  /**
   * Cumulative amount (in cents) spent on one-time credit purchases by this date
   */
  oneTimeAmount: number;

  /**
   * Total cumulative amount (in cents) spent by this date (plan + one-time)
   */
  total: number;
}
