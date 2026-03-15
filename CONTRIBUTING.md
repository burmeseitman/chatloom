# Contributing to ChatLoom

First off, thank you for considering contributing to ChatLoom! It's people like you that make ChatLoom such a great tool for the local AI community.

## 🌈 How Can I Contribute?

### Reporting Bugs
* Check the [GitHub Issues](https://github.com/burmeseitman/chatloom/issues) to see if the bug has already been reported.
* If you find a new bug, please open a new issue with a clear title and description, including steps to reproduce the issue.

### Suggesting Enhancements
* We are always looking for new ideas! Check the **Roadmap** in the `README.md` for our current focus.
* Open an issue to discuss your ideas before starting work to ensure it aligns with the project's vision.

### Pull Requests
1. **Fork the repo** and create your branch from `main`.
2. **Setup the local environment** following the steps in the [README.md](README.md#local-development).
3. **Write clean, documented code**.
4. **Test your changes** thoroughly.
5. **Issue a Pull Request** with a clear description of what you've changed.

## 🛠️ Development Requirements

### Frontend (Client)
- **Node.js**: v18.0.0 or higher.
- **Package Manager**: `npm`.
- **Prettier/ESLint**: Please follow the existing coding style (Standard React/Tailwind patterns).
- **Icons**: We use `lucide-react`.

### Backend (Server)
- **Python**: v3.9 or higher.
- **Environment**: Use a virtual environment (`venv`).
- **Dependencies**: Keep `requirements.txt` updated if you add new packages.
- **Security**: Never commit sensitive information (tokens, keys, absolute paths).

## 🎨 Coding Standards

- **Consistency**: Match the existing code's vibe and structure.
- **Comments**: Write clear comments for complex logic, especially in the Neural Bridge and Socket.IO handlers.
- **Commit Messages**: Use descriptive commit messages (e.g., `feat: add support for LM Studio`, `fix: resolve socket disconnection on safari`).

## 🤝 Community & Support

If you have questions, feel free to reach out via [GitHub Discussions](https://github.com/burmeseitman/chatloom/discussions) or connect with us on our social platforms.

---

*“Building software at the speed of thought.”*
