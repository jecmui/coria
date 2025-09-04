export function Now() {
    const tasks = [{
        name: 'Watch recitation lecture',
        duedate: 'Tomorrow',
        duetime: '11:59PM'
    }, {
        name: 'Quiz 1 (Take-Home)',
        duedate: 'Tuesday',
        duetime: '11:59PM'
    }, {
        name: 'Task 0: Problem Set',
        duedate: 'Friday',
        duetime: '11:59PM'
    }, {
        name: 'Assignment 1-1',
        duedate: 'Sep 12',
        duetime: '11:59PM'
    }, {
        name: 'Task 0: Game Features',
        duedate: 'Sep 12',
        duetime: '11:59PM'
    }, {
        name: 'Quiz 2 (Take-Home)',
        duedate: 'Sep 18',
        duetime: '11:59PM'
    }]

    const taskListItems = tasks.map(task =>
        <li>
            <div>
                {task.name}
            </div>
            <div>
                {task.duedate}
                {task.duetime}
            </div>
        </li>
    );

    return (
        <main className="">
            <h1>Now</h1>
            <ul>{taskListItems}</ul>
        </main>
    )
}