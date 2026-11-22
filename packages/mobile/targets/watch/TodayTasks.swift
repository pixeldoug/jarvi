import Foundation

/// A task as GET /api/tasks returns it (only the fields the watch shows).
/// Mirrors `Task` in src/types/models.ts.
struct WatchTask: Identifiable, Equatable, Decodable {
  let id: String
  let title: String
  var completed: Bool
  /// HH:mm
  let time: String?
  /// YYYY-MM-DD, sometimes with a time suffix.
  let dueDate: String?
  let createdAt: String

  init(id: String, title: String, completed: Bool = false, time: String? = nil, dueDate: String? = nil, createdAt: String = "") {
    self.id = id
    self.title = title
    self.completed = completed
    self.time = time
    self.dueDate = dueDate
    self.createdAt = createdAt
  }

  private enum CodingKeys: String, CodingKey {
    case id, title, completed, time
    case dueDate = "due_date"
    case createdAt = "created_at"
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    if let text = try? c.decode(String.self, forKey: .id) {
      id = text
    } else {
      id = String(try c.decode(Int.self, forKey: .id))
    }
    title = try c.decode(String.self, forKey: .title)
    // SQLite (local backend) sends 0/1, Postgres sends true/false.
    if let flag = try? c.decode(Bool.self, forKey: .completed) {
      completed = flag
    } else {
      completed = ((try? c.decode(Int.self, forKey: .completed)) ?? 0) != 0
    }
    time = try c.decodeIfPresent(String.self, forKey: .time)
    dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
    createdAt = (try c.decodeIfPresent(String.self, forKey: .createdAt)) ?? ""
  }

  /// The due date as YYYY-MM-DD, or nil (`dateKeyOf` in src/lib/dates.ts).
  var dateKey: String? {
    guard let dueDate else { return nil }
    let key = String(dueDate.prefix(while: { $0 != "T" }))
    return key.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil ? key : nil
  }

  var hasTime: Bool { !(time ?? "").isEmpty }
}

/// What the watch shows: the iPhone's "Atrasadas" and "Hoje" sections
/// (src/features/tasks/sections.ts), same order and rules.
enum TodayTasks {
  struct Sections: Equatable {
    var overdue: [WatchTask] = []
    /// Open tasks first, then the ones completed today.
    var today: [WatchTask] = []
  }

  static func dateKey(_ date: Date, calendar: Calendar = .current) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  static func sections(from tasks: [WatchTask], now: Date = Date(), calendar: Calendar = .current) -> Sections {
    let todayKey = dateKey(now, calendar: calendar)
    var result = Sections()
    var completedToday: [WatchTask] = []
    for task in sorted(tasks) {
      guard let key = task.dateKey else { continue }
      if key == todayKey {
        if task.completed { completedToday.append(task) } else { result.today.append(task) }
      } else if key < todayKey, !task.completed {
        result.overdue.append(task)
      }
    }
    result.today += completedToday
    return result
  }

  /// By date, timed before untimed, by time, then creation (`sortTasks`).
  static func sorted(_ tasks: [WatchTask]) -> [WatchTask] {
    tasks.sorted { a, b in
      switch (a.dateKey, b.dateKey) {
      case let (dateA?, dateB?):
        if dateA != dateB { return dateA < dateB }
        if a.hasTime != b.hasTime { return a.hasTime }
        if a.hasTime, let timeA = a.time, let timeB = b.time, timeA != timeB { return timeA < timeB }
      case (.some, nil):
        return true
      case (nil, .some):
        return false
      case (nil, nil):
        break
      }
      return a.createdAt < b.createdAt
    }
  }

  /// "12 nov" / "Nov 12" for an overdue task's date.
  static func shortDate(_ key: String, locale: Locale = .current, calendar: Calendar = .current) -> String {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    else { return key }
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.calendar = calendar
    formatter.setLocalizedDateFormatFromTemplate("dMMM")
    return formatter.string(from: date)
  }
}
