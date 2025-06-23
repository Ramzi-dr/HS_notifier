import fetch from "node-fetch";
import { logger } from "./logger.js";
import { convert } from "html-to-text";

class AsanaManager {
  constructor(notes, taskName) {
    this.notes = notes;
    this.token = process.env.ASANA_TOKEN;
    this.userId = process.env.ASANA_USER_ID;
    this.projectId = process.env.ASANA_PROJECT_ID;
    this.taskUrl = process.env.ASANA_TASK_URL;
    this.asanaSection = process.env.ASANA_SECTION;
    this.taskName = taskName;

    if (!this.token || !this.userId || !this.projectId || !this.taskUrl) {
      throw new Error("Missing required Asana environment variables.");
    }

    this.headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    this.sectionsUrl = `https://app.asana.com/api/1.0/projects/${this.projectId}/sections`;
    this.addTaskToSectionUrl = (taskId) =>
      `https://app.asana.com/api/1.0/tasks/${taskId}/addProject`;
  }

  async run() {
    try {
      const sectionId = await this.getUnprocessedSectionId();
      const taskId = await this.createTask();
      await this.addTaskToSection(taskId, sectionId);
    } catch (error) {
      const msg = `AsanaManager failed: ${error.message}`;
      logger.error(msg);
    }
  }

  async getUnprocessedSectionId() {
    const res = await fetch(this.sectionsUrl, { headers: this.headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        `Fetch sections failed: ${res.status} ${JSON.stringify(data)}`,
      );
    }

    const match = data.data.find(
      (section) =>
        section.name.toLowerCase() === this.asanaSection.toLowerCase(),
    );

    if (!match) {
      throw new Error("Unprocessed section not found");
    }

    return match.gid;
  }

  async createTask() {
    const isHTML = /<\/?[a-z][\s\S]*>/i.test(this.notes);

    const plainTextNotes = isHTML
      ? convert(this.notes, {
          wordwrap: false,
          selectors: [
            { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
          ],
        })
      : this.notes;

    const body = {
      data: {
        name: this.taskName,
        notes: plainTextNotes,
        projects: [this.projectId],
      },
    };

    const res = await fetch(this.taskUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        `Task creation failed: ${res.status} ${JSON.stringify(data)}`,
      );
    }

    return data.data.gid;
  }

  async addTaskToSection(taskId, sectionId) {
    const body = {
      data: {
        project: this.projectId,
        section: sectionId,
      },
    };

    const res = await fetch(this.addTaskToSectionUrl(taskId), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(
        `Add to section failed: ${res.status} ${JSON.stringify(data)}`,
      );
    }

    logger.info(`Task ${taskId} added to section ${sectionId}`);
  }
}

async function handleAsana(notes, taskName) {
  const instance = new AsanaManager(notes, taskName);
  await instance.run();
}

export default handleAsana;
