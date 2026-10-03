/** One document path, one writer. Failed content remains available for retry. */
export class DocumentSaveQueue {
  private pending: { html: string } | null = null
  private active: Promise<void> | null = null

  constructor(private readonly write: (html: string) => Promise<void>) {}

  get dirty(): boolean {
    return this.pending !== null
  }

  change(html: string): void {
    this.pending = { html }
  }

  flush(): Promise<void> {
    if (this.active) return this.active
    const save = async () => {
      while (this.pending) {
        const snapshot = this.pending
        await this.write(snapshot.html)
        if (this.pending === snapshot) this.pending = null
      }
    }
    this.active = save().finally(() => {
      this.active = null
    })
    return this.active
  }
}
